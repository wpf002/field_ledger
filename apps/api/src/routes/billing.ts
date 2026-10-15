import crypto from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@fl/db";
import { asPlan, type Plan } from "@fl/core";
import { verifyToken, tokenFromRequest, roleForFarm } from "../lib/session.js";

/**
 * Subscriptions through Stripe Billing: Checkout to subscribe, the Customer Portal to
 * change or cancel, and a signed webhook that sets the farm's plan. Nothing charges
 * until STRIPE_SECRET_KEY, a price ID per plan, and STRIPE_WEBHOOK_SECRET are set.
 * Without them, owners pick a plan directly (no charge) while the app isn't billing.
 */
const env = (k: string) => process.env[k] ?? "";
const PRICE: Record<Plan, string> = { essentials: "STRIPE_PRICE_ESSENTIALS", pro: "STRIPE_PRICE_PRO", business: "STRIPE_PRICE_BUSINESS" };
export const billingConfigured = () => !!env("STRIPE_SECRET_KEY") && !!env("STRIPE_WEBHOOK_SECRET") && Object.values(PRICE).every((k) => !!env(k));
const planForPrice = (price: string | undefined) => (Object.keys(PRICE) as Plan[]).find((p) => env(PRICE[p]) === price);
const webUrl = () => (process.env.PUBLIC_WEB_URL || process.env.WEB_ORIGIN || "http://localhost:3000").replace(/\/$/, "");

async function stripe<T>(path: string, body?: Record<string, string>): Promise<T> {
  const r = await fetch(`https://api.stripe.com/v1${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${env("STRIPE_SECRET_KEY")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: body ? new URLSearchParams(body).toString() : undefined,
  });
  const j = (await r.json()) as T & { error?: { message?: string } };
  if (!r.ok) throw new Error(j.error?.message ?? `Stripe ${r.status}`);
  return j;
}

/** Billing is the owner's (and admins'). */
async function billingAdmin(req: FastifyRequest, reply: FastifyReply, farmId: string) {
  const v = verifyToken(tokenFromRequest(req));
  const role = v ? await roleForFarm(v.userId, farmId) : null;
  if (role !== "OWNER" && role !== "ADMIN") { reply.code(403).send({ message: "Only the owner can change the plan." }); return null; }
  return v!;
}

/** Stripe-Signature: "t=...,v1=..." over `${t}.${rawBody}` (HMAC-SHA256), within five minutes. */
export function verifyStripeSignature(raw: string, header: string | undefined, secret: string, now = Date.now()) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]).filter((p) => p.length === 2).map(([k, v]) => [k, v]));
  const t = Number(parts.t);
  if (!t || Math.abs(now / 1000 - t) > 300) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  return header.split(",").filter((p) => p.startsWith("v1=")).some((p) => {
    const sig = p.slice(3);
    return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  });
}

export async function registerBilling(app: FastifyInstance) {
  app.get("/farms/:farmId/billing", async (req) => {
    const { farmId } = req.params as { farmId: string };
    const f = await prisma.farm.findUniqueOrThrow({ where: { id: farmId }, select: { plan: true, subscriptionStatus: true, stripeCustomerId: true } });
    return { plan: asPlan(f.plan), status: f.subscriptionStatus, configured: billingConfigured(), hasCustomer: !!f.stripeCustomerId };
  });

  app.post("/farms/:farmId/billing/checkout", async (req, reply) => {
    const { farmId } = req.params as { farmId: string };
    const v = await billingAdmin(req, reply, farmId); if (!v) return;
    const plan = asPlan((req.body as { plan?: string } | undefined)?.plan);
    if (!billingConfigured()) {
      await prisma.farm.update({ where: { id: farmId }, data: { plan } });
      await prisma.auditLog.create({ data: { farmId, actorId: v.userId, action: "update", entity: "Plan", entityId: farmId, after: { plan, billing: "not configured" } } });
      return { url: null, plan };
    }
    const [farm, user] = await Promise.all([
      prisma.farm.findUniqueOrThrow({ where: { id: farmId }, select: { stripeCustomerId: true, stripeSubscriptionId: true } }),
      prisma.user.findUniqueOrThrow({ where: { id: v.userId }, select: { email: true } }),
    ]);
    // An existing subscription changes plan in the portal, not a second checkout.
    if (farm.stripeSubscriptionId && farm.stripeCustomerId) {
      const p = await stripe<{ url: string }>("/billing_portal/sessions", { customer: farm.stripeCustomerId, return_url: `${webUrl()}/account` });
      return { url: p.url };
    }
    const s = await stripe<{ url: string }>("/checkout/sessions", {
      mode: "subscription", "line_items[0][price]": env(PRICE[plan]), "line_items[0][quantity]": "1",
      success_url: `${webUrl()}/account?billing=success`, cancel_url: `${webUrl()}/account?billing=cancel`,
      client_reference_id: farmId, "metadata[farmId]": farmId, "metadata[plan]": plan,
      "subscription_data[metadata][farmId]": farmId, "subscription_data[metadata][plan]": plan,
      ...(farm.stripeCustomerId ? { customer: farm.stripeCustomerId } : { customer_email: user.email }),
    });
    return { url: s.url };
  });

  app.post("/farms/:farmId/billing/portal", async (req, reply) => {
    const { farmId } = req.params as { farmId: string };
    if (!(await billingAdmin(req, reply, farmId))) return;
    const farm = await prisma.farm.findUniqueOrThrow({ where: { id: farmId }, select: { stripeCustomerId: true } });
    if (!billingConfigured() || !farm.stripeCustomerId) return reply.badRequest("No subscription to manage yet.");
    const p = await stripe<{ url: string }>("/billing_portal/sessions", { customer: farm.stripeCustomerId, return_url: `${webUrl()}/account` });
    return { url: p.url };
  });

  // Webhook: raw body for the signature, so it lives in its own scope with its own JSON parser.
  await app.register(async (child) => {
    child.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => done(null, body));
    child.post("/billing/webhook", async (req, reply) => {
      const raw = String(req.body ?? "");
      if (!env("STRIPE_WEBHOOK_SECRET") || !verifyStripeSignature(raw, req.headers["stripe-signature"] as string | undefined, env("STRIPE_WEBHOOK_SECRET"))) return reply.code(400).send({ message: "Bad signature" });
      const evt = JSON.parse(raw) as { type: string; data: { object: Record<string, unknown> } };
      const o = evt.data.object;
      if (evt.type === "checkout.session.completed") {
        const meta = (o.metadata ?? {}) as Record<string, string>;
        const farmId = meta.farmId ?? (o.client_reference_id as string | undefined);
        if (farmId) await prisma.farm.update({ where: { id: farmId }, data: { plan: asPlan(meta.plan), stripeCustomerId: o.customer as string, stripeSubscriptionId: o.subscription as string, subscriptionStatus: "active" } });
      } else if (evt.type === "customer.subscription.updated" || evt.type === "customer.subscription.deleted") {
        const sub = o as { id: string; status: string; metadata?: Record<string, string>; items?: { data?: { price?: { id?: string } }[] } };
        const farm = await prisma.farm.findFirst({ where: { stripeSubscriptionId: sub.id } });
        if (farm) {
          const ended = evt.type === "customer.subscription.deleted" || sub.status === "canceled";
          const plan = ended ? "essentials" : planForPrice(sub.items?.data?.[0]?.price?.id) ?? asPlan(sub.metadata?.plan);
          await prisma.farm.update({ where: { id: farm.id }, data: { plan, subscriptionStatus: sub.status, ...(ended ? { stripeSubscriptionId: null } : {}) } });
        }
      }
      return { received: true };
    });
  });
}
