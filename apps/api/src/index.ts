import "./env.js"; // must be first — loads root .env before env-reading modules
import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { registerHealth } from "./routes/health.js";
import { registerTransactions } from "./routes/transactions.js";
import { registerRecords } from "./routes/records.js";
import { registerFarm } from "./routes/farm.js";
import { registerImport } from "./routes/import.js";
import { registerReconcile } from "./routes/reconcile.js";
import { registerValuation } from "./routes/valuation.js";
import { registerObligations } from "./routes/obligations.js";
import { registerAlerts } from "./routes/alerts.js";
import { registerPlanning } from "./routes/planning.js";
import { registerReports } from "./routes/reports.js";
import { registerInvoices } from "./routes/invoices.js";
import { registerAssistant } from "./routes/assistant.js";
import { bigintReplySerializer } from "./plugins/bigint-serializer.js";
import { verifyToken, bearer, roleForFarm } from "./lib/session.js";

// 25 MB body limit so multi-year CSV/OFX statements parse without truncation.
const app = Fastify({ logger: true, bodyLimit: 25 * 1024 * 1024 });

// Invariant 1: BigInt money must serialize as strings, not throw. Applies to
// every route (setReplySerializer covers schemaless routes too).
app.setReplySerializer(bigintReplySerializer);

await app.register(cors, { origin: process.env.WEB_ORIGIN ?? true });
await app.register(sensible);

// Phase 8: role-gate writes. Reads (GET) and read-only POSTs (chat, import
// preview, reconcile match) are open; every mutating request to a farm requires
// a valid session token whose membership on that farm is not VIEWER.
const READ_ONLY_POST = ["/assistant/chat", "/assistant/quick-log", "/assistant/receipt", "/import/preview", "/reconcile/match"];
app.addHook("preHandler", async (req, reply) => {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return;
  if (req.method === "POST" && READ_ONLY_POST.some((s) => req.url.includes(s))) return;
  const farmId = req.url.match(/\/farms\/([^/?]+)/)?.[1];
  if (!farmId) return; // non-farm-scoped mutation
  const v = verifyToken(bearer(req.headers.authorization));
  if (!v) return reply.code(401).send({ message: "Sign in required." });
  const role = await roleForFarm(v.userId, farmId);
  if (!role) return reply.code(403).send({ message: "You don't have access to this farm." });
  if (role === "VIEWER") return reply.code(403).send({ message: "Viewers have read-only access." });
});

await registerHealth(app);
await registerFarm(app);
await registerTransactions(app);
await registerRecords(app);
await registerImport(app);
await registerReconcile(app);
await registerValuation(app);
await registerObligations(app);
await registerAlerts(app);
await registerPlanning(app);
await registerReports(app);
await registerInvoices(app);
await registerAssistant(app);

const port = Number(process.env.API_PORT ?? 4000);
const host = process.env.API_HOST ?? "0.0.0.0";
app.listen({ port, host }).then(() => app.log.info(`API on ${host}:${port}`));
