import "./env.js"; // must be first — loads root .env before env-reading modules
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import sensible from "@fastify/sensible";
import { registerHealth } from "./routes/health.js";
import { registerTransactions } from "./routes/transactions.js";
import { registerRecords } from "./routes/records.js";
import { registerFarm } from "./routes/farm.js";
import { registerImport, registerTableImport } from "./routes/import.js";
import { registerReconcile } from "./routes/reconcile.js";
import { registerValuation } from "./routes/valuation.js";
import { registerObligations } from "./routes/obligations.js";
import { registerAlerts } from "./routes/alerts.js";
import { registerPlanning } from "./routes/planning.js";
import { registerReports } from "./routes/reports.js";
import { registerInvoices } from "./routes/invoices.js";
import { registerAssistant } from "./routes/assistant.js";
import { registerIntegrations } from "./routes/integrations.js";
import { registerPublicApi } from "./routes/public-api.js";
import { registerOAuth } from "./routes/oauth.js";
import { registerMarketing } from "./routes/marketing.js";
import { bigintReplySerializer } from "./plugins/bigint-serializer.js";
import { verifyToken, tokenFromRequest, roleForFarm } from "./lib/session.js";

// 25 MB body limit so multi-year CSV/OFX statements parse without truncation.
const app = Fastify({ logger: true, bodyLimit: 25 * 1024 * 1024 });

// Invariant 1: BigInt money must serialize as strings, not throw. Applies to
// every route (setReplySerializer covers schemaless routes too).
app.setReplySerializer(bigintReplySerializer);

await app.register(cors, { origin: process.env.WEB_ORIGIN ?? true, credentials: true });
await app.register(cookie);
await app.register(sensible);

// Every /farms/:farmId route (reads included) requires a valid session token
// with a membership on that farm. Viewers may read (GET/HEAD and the read-only
// POSTs: chat, import preview, reconcile match) but not mutate. Routes outside
// /farms/:farmId (/integrations/providers, OAuth callback, /hooks, /v1, /mcp)
// carry their own auth.
const READ_ONLY_POST = ["/assistant/chat", "/assistant/quick-log", "/assistant/receipt", "/import/preview", "/reconcile/match"];
app.addHook("preHandler", async (req, reply) => {
  if (req.method === "OPTIONS") return;
  if (!req.routeOptions.url?.startsWith("/farms/:farmId")) return;
  const { farmId } = req.params as { farmId: string };
  const v = verifyToken(tokenFromRequest(req));
  if (!v) return reply.code(401).send({ message: "Sign in required." });
  const role = await roleForFarm(v.userId, farmId);
  if (!role) return reply.code(403).send({ message: "You don't have access to this farm." });
  if (req.method === "GET" || req.method === "HEAD") return;
  if (req.method === "POST" && READ_ONLY_POST.some((s) => req.routeOptions.url!.endsWith(s))) return;
  if (role === "VIEWER") return reply.code(403).send({ message: "Viewers have read-only access." });
});

await registerHealth(app);
await registerFarm(app);
await registerTransactions(app);
await registerRecords(app);
await registerImport(app);
await registerTableImport(app);
await registerReconcile(app);
await registerValuation(app);
await registerObligations(app);
await registerAlerts(app);
await registerPlanning(app);
await registerMarketing(app);
await registerReports(app);
await registerInvoices(app);
await registerAssistant(app);
await registerIntegrations(app);
await registerPublicApi(app);
await registerOAuth(app);

// Railway (and most PaaS) inject the port to bind on via PORT.
const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
const host = process.env.API_HOST ?? "0.0.0.0";
app.listen({ port, host }).then(() => app.log.info(`API on ${host}:${port}`));
