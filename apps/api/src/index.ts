import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Load the single root .env regardless of where the process is launched from.
const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, "../../../.env") });

import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { registerHealth } from "./routes/health.js";
import { registerTransactions } from "./routes/transactions.js";
import { registerFarm } from "./routes/farm.js";
import { registerImport } from "./routes/import.js";
import { registerReconcile } from "./routes/reconcile.js";
import { registerValuation } from "./routes/valuation.js";
import { registerObligations } from "./routes/obligations.js";
import { registerAlerts } from "./routes/alerts.js";
import { registerPlanning } from "./routes/planning.js";
import { registerReports } from "./routes/reports.js";
import { registerInvoices } from "./routes/invoices.js";
import { bigintReplySerializer } from "./plugins/bigint-serializer.js";

// 25 MB body limit so multi-year CSV/OFX statements parse without truncation.
const app = Fastify({ logger: true, bodyLimit: 25 * 1024 * 1024 });

// Invariant 1: BigInt money must serialize as strings, not throw. Applies to
// every route (setReplySerializer covers schemaless routes too).
app.setReplySerializer(bigintReplySerializer);

await app.register(cors, { origin: process.env.WEB_ORIGIN ?? true });
await app.register(sensible);

await registerHealth(app);
await registerFarm(app);
await registerTransactions(app);
await registerImport(app);
await registerReconcile(app);
await registerValuation(app);
await registerObligations(app);
await registerAlerts(app);
await registerPlanning(app);
await registerReports(app);
await registerInvoices(app);

const port = Number(process.env.API_PORT ?? 4000);
const host = process.env.API_HOST ?? "0.0.0.0";
app.listen({ port, host }).then(() => app.log.info(`API on ${host}:${port}`));
