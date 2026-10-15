import crypto from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma, applyExternalBatch, sealToken, openToken } from "@fl/db";
import { emptyBatch, type ExternalBatch } from "@fl/core";
import { PROVIDERS, providerByKey, configured, plaid, type Tokens } from "../integrations/providers.js";
import { verifyToken, tokenFromRequest, roleForFarm } from "../lib/session.js";
import { planFor } from "../lib/plan.js";
import { canUseIntegration, integrationPlan, PLAN_NAME } from "@fl/core";

const secret = () => process.env.AUTH_SECRET || "insecure-dev-secret";
const webUrl = () => (process.env.PUBLIC_WEB_URL || process.env.WEB_ORIGIN || "http://localhost:3000").replace(/\/$/, "");
const redirectUri = (provider: string) => `${webUrl()}/api/integrations/${provider}/callback`;

/** Signed, short-lived OAuth state binding the callback to a farm, provider, and user. */
function signState(o: { farmId: string; provider: string; userId: string }) {
  const payload = Buffer.from(JSON.stringify({ ...o, exp: Date.now() + 15 * 60_000, n: crypto.randomBytes(8).toString("hex") })).toString("base64url");
  return `${payload}.${crypto.createHmac("sha256", secret()).update(payload).digest("base64url")}`;
}
function readState(state: string) {
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return null;
  const expected = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const o = JSON.parse(Buffer.from(payload, "base64url").toString()) as { farmId: string; provider: string; userId: string; exp: number };
  return o.exp > Date.now() ? o : null;
}

/** Writers only: connecting and syncing change the books. */
async function writer(req: FastifyRequest, reply: FastifyReply, farmId: string) {
  const v = verifyToken(tokenFromRequest(req));
  if (!v) { reply.code(401).send({ message: "Sign in required." }); return null; }
  const role = await roleForFarm(v.userId, farmId);
  if (!role || role === "VIEWER" || role === "ACCOUNTANT") { reply.code(403).send({ message: "Only owners and members can manage integrations." }); return null; }
  return v.userId;
}

/** Connectors beyond the farm's plan answer with the plan they need. */
async function planAllows(reply: FastifyReply, farmId: string, provider: string) {
  if (canUseIntegration(await planFor(farmId), provider)) return true;
  reply.code(403).send({ message: `${provider} is on the ${PLAN_NAME[integrationPlan(provider)]} plan.` });
  return false;
}

async function saveConnection(farmId: string, provider: string, t: Tokens, cursor?: object) {
  const c = await prisma.connection.create({
    data: {
      farmId, provider, externalAccountId: t.externalAccountId ?? null, label: t.label ?? null,
      accessTokenEnc: sealToken(t.accessToken), refreshTokenEnc: t.refreshToken ? sealToken(t.refreshToken) : null,
      expiresAt: t.expiresIn ? new Date(Date.now() + t.expiresIn * 1000) : null, cursor: cursor ?? {},
    },
  });
  await prisma.auditLog.create({ data: { farmId, action: "create", entity: "Connection", entityId: c.id, after: { provider } } });
  return c;
}

/** The farm's commodities (for market prices) and state, from crops and its location. */
async function farmProfile(farmId: string) {
  const [farm, seasons] = await Promise.all([prisma.farm.findUnique({ where: { id: farmId } }), prisma.cropSeason.findMany({ where: { farmId }, select: { crop: true } })]);
  const crops = [...new Set(seasons.map((s) => s.crop.split(/[\s(]/)[0]!.toUpperCase()))].filter((c) => ["CORN", "SOYBEANS", "WHEAT", "COTTON", "HAY", "SORGHUM", "OATS", "BARLEY"].includes(c));
  const state = farm?.location?.match(/,\s*([A-Z]{2})\b|,\s*(Texas|Kansas|Oklahoma|Nebraska|Iowa|Missouri|Colorado)\b/i)?.[0]?.replace(/^,\s*/, "") ?? null;
  const STATES: Record<string, string> = { TX: "Texas", KS: "Kansas", OK: "Oklahoma", NE: "Nebraska", IA: "Iowa", MO: "Missouri", CO: "Colorado" };
  return { commodities: crops.length ? crops : ["CATTLE"], state: state ? STATES[state.toUpperCase()] ?? state : null };
}

export async function runSync(connectionId: string) {
  const conn = await prisma.connection.findUniqueOrThrow({ where: { id: connectionId } });
  const p = providerByKey(conn.provider);
  if (!p?.sync) throw new Error(`${conn.provider} has no sync`);
  const run = await prisma.syncRun.create({ data: { connectionId } });
  try {
    let access = openToken(conn.accessTokenEnc) ?? "";
    if (conn.expiresAt && conn.expiresAt.getTime() < Date.now() + 60_000 && p.refresh && conn.refreshTokenEnc) {
      const t = await p.refresh(openToken(conn.refreshTokenEnc)!);
      access = t.accessToken;
      await prisma.connection.update({ where: { id: conn.id }, data: { accessTokenEnc: sealToken(t.accessToken), refreshTokenEnc: t.refreshToken ? sealToken(t.refreshToken) : conn.refreshTokenEnc, expiresAt: t.expiresIn ? new Date(Date.now() + t.expiresIn * 1000) : null } });
    }
    const since = conn.lastSyncAt ?? new Date(Date.now() - 2 * 365 * 86_400_000);
    const { batch, cursor } = await p.sync({ accessToken: access, externalAccountId: conn.externalAccountId, cursor: (conn.cursor ?? {}) as Record<string, unknown>, since, farm: await farmProfile(conn.farmId) });
    const counts = await applyExternalBatch(prisma, conn.farmId, conn.provider, batch);
    await prisma.connection.update({ where: { id: conn.id }, data: { lastSyncAt: new Date(), lastError: null, status: "connected", cursor: (cursor ?? conn.cursor ?? {}) as object } });
    await prisma.syncRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), status: "ok", counts } });
    return counts;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.connection.update({ where: { id: conn.id }, data: { lastError: msg.slice(0, 500), status: "error" } });
    await prisma.syncRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), status: "error", error: msg.slice(0, 500) } });
    throw e;
  }
}

/** Records pushed by Zapier or another system, in Acreflow's neutral shape. */
const hookBody = z.object({
  transactions: z.array(z.object({ id: z.string(), date: z.string(), amount: z.number(), description: z.string(), category: z.string().optional(), counterparty: z.string().optional() })).optional(),
  invoices: z.array(z.object({ id: z.string(), number: z.string(), customer: z.string(), issued: z.string(), due: z.string(), total: z.number(), balance: z.number() })).optional(),
});

export async function registerIntegrations(app: FastifyInstance) {
  app.get("/integrations/providers", async () => PROVIDERS.map((p) => ({
    key: p.key, name: p.name, category: p.category, phase: p.phase, auth: p.auth, pulls: p.pulls, docs: p.docs, env: p.env, configured: configured(p),
    fields: p.fields?.map((f) => ({ key: f.key, label: f.label, secret: !!f.secret, placeholder: f.placeholder })),
  })));

  // Per-farm credentials (PayPal app keys, AMS report picks): checked, sealed, then synced.
  app.post("/farms/:farmId/integrations/:provider/credentials", async (req, reply) => {
    const { farmId, provider } = req.params as { farmId: string; provider: string };
    if (!(await writer(req, reply, farmId))) return;
    if (!(await planAllows(reply, farmId, provider))) return;
    const p = providerByKey(provider);
    if (!p?.fields || p.auth !== "credentials") return reply.badRequest("This provider doesn't take credentials.");
    if (!configured(p)) return reply.badRequest(`Set ${p.env.join(", ")} on the server first.`);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const creds = Object.fromEntries(p.fields.map((f) => [f.key, String(body[f.key] ?? "").trim()]));
    const missing = p.fields.filter((f) => !creds[f.key]).map((f) => f.label);
    if (missing.length) return reply.badRequest(`Missing ${missing.join(", ")}.`);
    let label: string | undefined;
    try { label = (await p.verify?.(creds))?.label; } catch (e) { return reply.badRequest(`Couldn't connect: ${e instanceof Error ? e.message.slice(0, 200) : "check the values"}`); }
    const c = await saveConnection(farmId, provider, { accessToken: JSON.stringify(creds), label });
    runSync(c.id).catch(() => {});
    return { id: c.id };
  });

  // Hosted connect page (Finicity Connect, MX Connect widget): the connection exists
  // as soon as the remote user does; accounts linked on the page show up on sync.
  app.post("/farms/:farmId/integrations/:provider/connect-url", async (req, reply) => {
    const { farmId, provider } = req.params as { farmId: string; provider: string };
    if (!(await writer(req, reply, farmId))) return;
    if (!(await planAllows(reply, farmId, provider))) return;
    const p = providerByKey(provider);
    if (!p?.connectUrl) return reply.badRequest("This provider doesn't use a connect page.");
    if (!configured(p)) return reply.badRequest(`Set ${p.env.join(", ")} on the server first.`);
    const existing = await prisma.connection.findFirst({ where: { farmId, provider } });
    const { url, externalAccountId } = await p.connectUrl({ farmId, redirectUri: `${webUrl()}/integrations?connected=${provider}`, externalAccountId: existing?.externalAccountId });
    if (!existing) await saveConnection(farmId, provider, { accessToken: "hosted", externalAccountId, label: p.name });
    return { url };
  });

  // Server-key sources (market prices, benchmarks): the key is the server's, the farm opts in.
  app.post("/farms/:farmId/integrations/:provider/enable", async (req, reply) => {
    const { farmId, provider } = req.params as { farmId: string; provider: string };
    if (!(await writer(req, reply, farmId))) return;
    if (!(await planAllows(reply, farmId, provider))) return;
    const p = providerByKey(provider);
    if (p?.auth !== "server_key" || !p.sync) return reply.badRequest("This provider isn't enabled per farm.");
    if (!configured(p)) return reply.badRequest(`Set ${p.env.join(", ")} on the server first.`);
    const c = (await prisma.connection.findFirst({ where: { farmId, provider } })) ?? (await saveConnection(farmId, provider, { accessToken: "server", label: p.name }));
    runSync(c.id).catch(() => {});
    return { id: c.id };
  });

  app.get("/farms/:farmId/integrations", async (req) => {
    const { farmId } = req.params as { farmId: string };
    const conns = await prisma.connection.findMany({ where: { farmId }, orderBy: { createdAt: "asc" }, include: { syncRuns: { orderBy: { startedAt: "desc" }, take: 1 } } });
    return conns.map((c) => ({ id: c.id, provider: c.provider, status: c.status, label: c.label, externalAccountId: c.externalAccountId, lastSyncAt: c.lastSyncAt, lastError: c.lastError, lastRun: c.syncRuns[0] ?? null, cursor: c.provider === "nws" || c.provider === "webhook" ? c.cursor : undefined }));
  });

  // OAuth start: returns the provider's consent URL.
  app.get("/farms/:farmId/integrations/:provider/connect", async (req, reply) => {
    const { farmId, provider } = req.params as { farmId: string; provider: string };
    const userId = await writer(req, reply, farmId); if (!userId) return;
    if (!(await planAllows(reply, farmId, provider))) return;
    const p = providerByKey(provider);
    if (!p?.authorizeUrl) return reply.badRequest("This provider doesn't connect by OAuth.");
    if (!configured(p)) return reply.badRequest(`Set ${p.env.join(", ")} to enable ${p.name}.`);
    return { url: p.authorizeUrl(signState({ farmId, provider, userId }), redirectUri(provider)) };
  });

  // OAuth callback (reached through the web origin's /api proxy).
  app.get("/integrations/:provider/callback", async (req, reply) => {
    const { provider } = req.params as { provider: string };
    const q = req.query as Record<string, string>;
    const st = q.state ? readState(q.state) : null;
    const p = providerByKey(provider);
    if (!st || st.provider !== provider || !p?.exchange) return reply.redirect(`${webUrl()}/integrations?error=state`);
    if (q.error || !q.code) return reply.redirect(`${webUrl()}/integrations?error=${encodeURIComponent(q.error ?? "denied")}`);
    const role = await roleForFarm(st.userId, st.farmId);
    if (!role || role === "VIEWER" || role === "ACCOUNTANT") return reply.redirect(`${webUrl()}/integrations?error=role`);
    try {
      const t = await p.exchange(q.code, redirectUri(provider), q);
      const c = await saveConnection(st.farmId, provider, t);
      runSync(c.id).catch(() => undefined); // first sync in the background
      return reply.redirect(`${webUrl()}/integrations?connected=${provider}`);
    } catch {
      return reply.redirect(`${webUrl()}/integrations?error=exchange`);
    }
  });

  // Plaid Link: token for the widget, then exchange the public token it returns.
  app.post("/farms/:farmId/integrations/plaid/link-token", async (req, reply) => {
    const { farmId } = req.params as { farmId: string };
    if (!(await planAllows(reply, farmId, "plaid"))) return;
    const p = providerByKey("plaid")!;
    if (!configured(p)) return reply.badRequest(`Set ${p.env.join(", ")} to enable bank connections.`);
    const v = verifyToken(tokenFromRequest(req))!;
    return { linkToken: (await plaid.linkToken(`${v.userId}:${farmId}`)).link_token };
  });
  app.post("/farms/:farmId/integrations/plaid/exchange", async (req, reply) => {
    const { farmId } = req.params as { farmId: string };
    const parsed = z.object({ publicToken: z.string().min(1), institution: z.string().optional() }).safeParse(req.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const t = await plaid.exchange(parsed.data.publicToken);
    const c = await saveConnection(farmId, "plaid", { ...t, label: parsed.data.institution });
    runSync(c.id).catch(() => undefined);
    return reply.code(201).send({ id: c.id });
  });

  // Weather: store the farm's coordinates; forecasts come from the public NWS API.
  app.post("/farms/:farmId/integrations/nws", async (req, reply) => {
    const { farmId } = req.params as { farmId: string };
    const parsed = z.object({ lat: z.number().min(18).max(72), lon: z.number().min(-180).max(-60) }).safeParse(req.body);
    if (!parsed.success) return reply.badRequest("Enter US latitude and longitude.");
    const existing = await prisma.connection.findFirst({ where: { farmId, provider: "nws" } });
    const c = existing
      ? await prisma.connection.update({ where: { id: existing.id }, data: { cursor: parsed.data, status: "connected" } })
      : await prisma.connection.create({ data: { farmId, provider: "nws", cursor: parsed.data, label: `${parsed.data.lat.toFixed(3)}, ${parsed.data.lon.toFixed(3)}` } });
    return reply.code(201).send({ id: c.id });
  });
  app.get("/farms/:farmId/weather/forecast", async (req, reply) => {
    const { farmId } = req.params as { farmId: string };
    const c = await prisma.connection.findFirst({ where: { farmId, provider: "nws" } });
    const at = c?.cursor as { lat: number; lon: number } | null;
    if (!at) return reply.notFound("Set the farm's coordinates first.");
    const headers = { "User-Agent": `Acreflow (${process.env.SUPPORT_EMAIL || "support@acreflow.app"})`, Accept: "application/geo+json" };
    const point = await fetch(`https://api.weather.gov/points/${at.lat.toFixed(4)},${at.lon.toFixed(4)}`, { headers }).then((r) => r.json()) as { properties?: { forecast?: string } };
    if (!point.properties?.forecast) return reply.badGateway("Weather service unavailable.");
    const fc = await fetch(point.properties.forecast, { headers }).then((r) => r.json()) as { properties?: { periods?: unknown[] } };
    const { mapNwsPeriod } = await import("@fl/core");
    return { periods: ((fc.properties?.periods ?? []) as Parameters<typeof mapNwsPeriod>[0][]).map(mapNwsPeriod) };
  });

  // Webhook: one secret URL per farm for Zapier (Farmbrite) and other push sources.
  app.post("/farms/:farmId/integrations/webhook", async (req, reply) => {
    const { farmId } = req.params as { farmId: string };
    const token = crypto.randomBytes(24).toString("base64url");
    const c = await prisma.connection.create({ data: { farmId, provider: "webhook", accessTokenEnc: sealToken(token), label: "Webhook" } });
    return reply.code(201).send({ id: c.id, url: `${webUrl()}/api/hooks/${c.id}/${token}` });
  });
  app.post("/hooks/:connectionId/:token", async (req, reply) => {
    const { connectionId, token } = req.params as { connectionId: string; token: string };
    const c = await prisma.connection.findUnique({ where: { id: connectionId } });
    const expected = openToken(c?.accessTokenEnc);
    if (!c || c.provider !== "webhook" || !expected || expected.length !== token.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token))) return reply.code(404).send();
    const parsed = hookBody.safeParse(req.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const b: ExternalBatch = emptyBatch();
    for (const t of parsed.data.transactions ?? []) b.txns.push({ externalId: `hook:${t.id}`, date: t.date, cashDate: t.date, amountCents: BigInt(Math.round(t.amount * 100)), description: t.description, categoryHint: t.category ?? null, counterparty: t.counterparty ?? null });
    for (const i of parsed.data.invoices ?? []) b.docs.push({ externalId: `hook:${i.id}`, kind: "invoice", number: i.number, partyExternalId: `hook:cust:${i.customer.toLowerCase()}`, partyName: i.customer, issued: i.issued, due: i.due, totalCents: BigInt(Math.round(i.total * 100)), balanceCents: BigInt(Math.round(i.balance * 100)) });
    const counts = await applyExternalBatch(prisma, c.farmId, "webhook", b);
    await prisma.connection.update({ where: { id: c.id }, data: { lastSyncAt: new Date() } });
    return counts;
  });

  app.post("/farms/:farmId/integrations/:id/sync", async (req, reply) => {
    const { farmId, id } = req.params as { farmId: string; id: string };
    const c = await prisma.connection.findFirst({ where: { id, farmId } });
    if (!c) return reply.notFound();
    try { return await runSync(c.id); } catch (e) { return reply.badGateway(e instanceof Error ? e.message : "Sync failed"); }
  });

  app.delete("/farms/:farmId/integrations/:id", async (req, reply) => {
    const { farmId, id } = req.params as { farmId: string; id: string };
    const c = await prisma.connection.findFirst({ where: { id, farmId } });
    if (!c) return reply.notFound();
    await prisma.connection.delete({ where: { id } });
    await prisma.auditLog.create({ data: { farmId, action: "delete", entity: "Connection", entityId: id, before: { provider: c.provider } } });
    return reply.code(204).send();
  });
}
