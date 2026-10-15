import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { prisma, verifyApiToken } from "@fl/db";
import { LEDGER_TOOLS, TOOL_TIER } from "../lib/ledger-tools.js";
import { bearer } from "../lib/session.js";

/**
 * Public API (/v1) and remote MCP server (/mcp) for ChatGPT, Claude, Gemini, or any
 * MCP client. Both expose the assistant's tools: read tools to every token, analyze
 * tools (forecasts, scenarios, insights, brief) to tokens with the analyze scope.
 * Nothing here writes to the books or moves money.
 */
const TOOL_DOCS: Record<string, { title: string; description: string; input?: z.ZodRawShape }> = {
  financial_summary: { title: "Financial Summary", description: "Year-to-date revenue, expenses, net farm income, inventory value, liabilities, and net worth at market." },
  cash_position: { title: "Cash Position", description: "Cash, operating line balance and availability, working capital, receivables, payables." },
  cash_forecast: { title: "Cash Forecast", description: "13-week and 12-month cash forecast with line balance and reserve check.", input: { scenario: z.enum(["base", "optimistic", "downside"]).optional() } },
  enterprise_profitability: { title: "Enterprise Profitability", description: "P&L by enterprise for a year.", input: { year: z.number().int().optional() } },
  crop_profitability: { title: "Crop Profitability", description: "Per-acre revenue, cost, profit, and break-evens by crop season.", input: { year: z.number().int().optional() } },
  livestock_profitability: { title: "Livestock Profitability", description: "Per-head revenue, cost, and profit by livestock enterprise.", input: { year: z.number().int().optional() } },
  debt_summary: { title: "Debt Summary", description: "Loans, debt ratios, term debt coverage, repayment margin." },
  inventory_position: { title: "Inventory", description: "Inventory on hand with cost basis and market value." },
  accounts_receivable: { title: "Accounts Receivable", description: "Open invoices and aging." },
  financial_health: { title: "Financial Health", description: "0-100 health score by category with ratios." },
  insights: { title: "Insights", description: "Findings about the operation with recommendations and sources." },
  financial_brief: { title: "Financial Brief", description: "Weekly or monthly brief with recommended actions.", input: { kind: z.enum(["weekly", "monthly"]).optional() } },
  run_scenario: { title: "Run Scenario", description: "What-if over 12 months: price/volume/cost changes, equipment purchase, new hire. Read-only.", input: { pricePct: z.number().optional(), volumePct: z.number().optional(), costPct: z.number().optional(), equipmentPrice: z.number().optional(), downPayment: z.number().optional(), ratePct: z.number().optional(), years: z.number().int().optional(), hireAnnualWage: z.number().optional() } },
};
const allowedTools = (scope: "read" | "analyze") => Object.keys(TOOL_DOCS).filter((t) => TOOL_TIER[t] === "read" || scope === "analyze");
const toJson = (data: unknown) => JSON.parse(JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));

async function auth(req: FastifyRequest, reply: FastifyReply) {
  const t = await verifyApiToken(prisma, bearer(req.headers.authorization));
  if (!t) { reply.code(401).header("WWW-Authenticate", 'Bearer realm="acreflow"').send({ message: "A valid API token is required." }); return null; }
  return t;
}

function buildMcp(farmId: string, scope: "read" | "analyze") {
  const server = new McpServer({ name: "acreflow", version: "1.0.0" });
  for (const name of allowedTools(scope)) {
    const doc = TOOL_DOCS[name]!;
    server.registerTool(name, { title: doc.title, description: doc.description, inputSchema: doc.input ?? {}, annotations: { readOnlyHint: true, openWorldHint: false } }, async (args: Record<string, unknown>) => {
      const data = await LEDGER_TOOLS[name]!(farmId, args);
      return { content: [{ type: "text" as const, text: JSON.stringify(toJson(data)) }] };
    });
  }
  return server;
}

export async function registerPublicApi(app: FastifyInstance) {
  app.get("/v1", async (req, reply) => {
    const t = await auth(req, reply); if (!t) return;
    const farm = await prisma.farm.findUnique({ where: { id: t.farmId }, select: { id: true, name: true } });
    return { farm, scope: t.scope, endpoints: allowedTools(t.scope).map((n) => ({ path: `/v1/${n}`, method: n === "run_scenario" ? "POST" : "GET", ...TOOL_DOCS[n], input: undefined })) };
  });

  app.get("/v1/:tool", async (req, reply) => {
    const t = await auth(req, reply); if (!t) return;
    const { tool } = req.params as { tool: string };
    if (!allowedTools(t.scope).includes(tool) || tool === "run_scenario") return reply.notFound();
    const q = req.query as Record<string, string>;
    const input = Object.fromEntries(Object.entries(q).map(([k, v]) => [k, /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v]));
    return toJson(await LEDGER_TOOLS[tool]!(t.farmId, input));
  });

  app.post("/v1/run_scenario", async (req, reply) => {
    const t = await auth(req, reply); if (!t) return;
    if (t.scope !== "analyze") return reply.forbidden("This token can't run scenarios.");
    const parsed = z.object(TOOL_DOCS.run_scenario!.input!).safeParse(req.body ?? {});
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    return toJson(await LEDGER_TOOLS.run_scenario!(t.farmId, parsed.data));
  });

  // Remote MCP, stateless Streamable HTTP: one server per request, scoped to the token's farm.
  app.post("/mcp", async (req, reply) => {
    const t = await auth(req, reply); if (!t) return;
    const server = buildMcp(t.farmId, t.scope);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    reply.hijack();
    reply.raw.on("close", () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req.raw, reply.raw, req.body);
  });
  app.get("/mcp", async (_req, reply) => reply.code(405).header("Allow", "POST").send({ message: "Use POST (stateless Streamable HTTP)." }));
}
