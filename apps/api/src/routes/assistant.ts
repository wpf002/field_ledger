import type { FastifyInstance } from "fastify";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@fl/db";
import { z } from "zod";
import { classifyChat, parseQuickLog, formatCentsDisplay, inferScheduleFCode } from "@fl/core";
import {
  LEDGER_TOOLS, financialSummary, recentTransactions, upcomingObligations,
  marketableInventory, budgetStatuses, scheduleFReport, alertsList,
} from "../lib/ledger-tools.js";

const MODEL = process.env.FLINT_MODEL || "claude-opus-4-8";
const hasKey = () => !!process.env.ANTHROPIC_API_KEY;
const fmt = (cents: string) => formatCentsDisplay(BigInt(cents), { sign: false });

const SYSTEM = `You are Flint, the assistant for the Field & Ledger farm accounting app.
Answer questions about the farm's finances ONLY using the provided tools, which return the user's real ledger data.
Every number you state MUST come from a tool result — never estimate, guess, or invent figures.
If the data needed to answer isn't available from the tools, say so plainly. Be concise and practical. Money is in integer cents; format it as dollars.`;

const ANTHROPIC_TOOLS: Anthropic.Tool[] = [
  { name: "financial_summary", description: "Total income, expenses, net profit, inventory value, liabilities, and net worth.", input_schema: { type: "object", properties: {} } },
  { name: "recent_transactions", description: "The most recent ledger transactions.", input_schema: { type: "object", properties: { limit: { type: "integer" } } } },
  { name: "upcoming_obligations", description: "Loan and lease payments due within a window of days.", input_schema: { type: "object", properties: { days: { type: "integer" } } } },
  { name: "marketable_inventory", description: "Livestock and crops available to sell, valued at current market prices.", input_schema: { type: "object", properties: {} } },
  { name: "budget_status", description: "Budget vs actual spend per category.", input_schema: { type: "object", properties: {} } },
  { name: "schedule_f", description: "Schedule F tax summary (gross income, expenses, net farm profit) for a year.", input_schema: { type: "object", properties: { year: { type: "integer" } } } },
  { name: "alerts", description: "Active alerts: overdue invoices, expired leases, upcoming payments, budget overages.", input_schema: { type: "object", properties: {} } },
];

/** Grounded answer without an LLM: route to a tool, format its real figures. */
async function chatDeterministic(farmId: string, message: string) {
  const intent = classifyChat(message);
  let answer = "";
  if (intent === "summary") {
    const s = await financialSummary(farmId);
    answer = `Based on your ledger — income ${fmt(s.incomeCents)}, expenses ${fmt(s.expenseCents)}, net profit ${fmt(s.netProfitCents)}. Tracked inventory is valued at ${fmt(s.inventoryValueCents)} against ${fmt(s.liabilitiesCents)} of liabilities, so your estimated net worth is ${fmt(s.netWorthCents)}.`;
  } else if (intent === "transactions") {
    const t = await recentTransactions(farmId, 5);
    answer = t.length ? `Your 5 most recent transactions:\n${t.map((x) => `• ${x.date} — ${x.description} (${x.category}): ${formatCentsDisplay(BigInt(x.amountCents), { sign: true })}`).join("\n")}` : "I don't have any transactions recorded yet.";
  } else if (intent === "obligations") {
    const o = await upcomingObligations(farmId, 90);
    answer = `Over the next 90 days you have ${fmt(o.totalCents)} in obligations — ${fmt(o.loanPaymentsCents)} in loan payments and ${fmt(o.leasePaymentsCents)} in lease/rent.` + (o.items.length ? `\n${o.items.map((i) => `• ${i.name}: ${fmt(i.amountCents)} (${i.due})`).join("\n")}` : "");
  } else if (intent === "inventory") {
    const m = await marketableInventory(farmId);
    answer = m.items.length ? `Marketable inventory totals ${fmt(m.totalCents)}:\n${m.items.map((i) => `• ${i.name}: ${i.quantity.toLocaleString()} ${i.unit} at ${fmt(i.unitPriceCents)}/unit = ${fmt(i.valueCents)}`).join("\n")}` : "I don't have any marketable inventory recorded.";
  } else if (intent === "budgets") {
    const b = await budgetStatuses(farmId);
    const over = b.filter((x) => x.over);
    answer = b.length ? `Budget status: ${b.map((x) => `${x.label} ${x.pct}%${x.over ? " (over)" : ""}`).join(", ")}.` + (over.length ? ` You're over budget on ${over.map((x) => x.label).join(", ")}.` : " Nothing is over budget.") : "No budgets are set.";
  } else if (intent === "schedule_f") {
    const sf = await scheduleFReport(farmId);
    answer = `For ${sf.year}, your Schedule F shows ${fmt(sf.grossIncomeCents)} gross income and ${fmt(sf.totalExpenseCents)} in deductible expenses, for a net farm profit of ${fmt(sf.netFarmProfitCents)}.`;
  } else {
    const a = await alertsList(farmId);
    answer = a.length ? `You have ${a.length} active alert${a.length === 1 ? "" : "s"}:\n${a.map((x) => `• [${x.severity}] ${x.title} — ${x.message}`).join("\n")}` : "You're all caught up — no active alerts.";
  }
  return { answer, mode: "deterministic" as const, tool: intent };
}

/** Grounded answer via Claude tool-calling over the same ledger tools. */
async function chatClaude(farmId: string, message: string) {
  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: message }];
  for (let i = 0; i < 6; i++) {
    const res = await client.messages.create({ model: MODEL, max_tokens: 8000, system: SYSTEM, tools: ANTHROPIC_TOOLS, messages });
    if (res.stop_reason !== "tool_use") {
      const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
      return { answer: text, mode: "claude" as const, model: MODEL };
    }
    messages.push({ role: "assistant", content: res.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of res.content) {
      if (block.type === "tool_use") {
        const handler = LEDGER_TOOLS[block.name];
        const data = handler ? await handler(farmId, block.input as Record<string, unknown>) : { error: "unknown tool" };
        results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(data) });
      }
    }
    messages.push({ role: "user", content: results });
  }
  return { answer: "I wasn't able to complete that — please try rephrasing.", mode: "claude" as const, model: MODEL };
}

export async function registerAssistant(app: FastifyInstance) {
  app.get("/assistant/status", async () => ({ mode: hasKey() ? "claude" : "deterministic", model: hasKey() ? MODEL : null }));

  // Grounded chat — every figure traces to a ledger tool (Invariant 3).
  app.post("/farms/:farmId/assistant/chat", async (req, reply) => {
    const { farmId } = req.params as { farmId: string };
    const parsed = z.object({ message: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    try {
      return hasKey() ? await chatClaude(farmId, parsed.data.message) : await chatDeterministic(farmId, parsed.data.message);
    } catch (e) {
      // Fall back to grounded deterministic answer if the LLM call fails.
      return { ...(await chatDeterministic(farmId, parsed.data.message)), note: e instanceof Error ? e.message : "llm error" };
    }
  });

  // Quick Log: parse NL into a DRAFT transaction. Never writes — the client
  // confirms, then posts to /transactions (audited, period-locked).
  app.post("/farms/:farmId/assistant/quick-log", async (req, reply) => {
    const { farmId } = req.params as { farmId: string };
    const parsed = z.object({ text: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const draft = parseQuickLog(parsed.data.text, new Date().toISOString().slice(0, 10));
    if ("error" in draft) return reply.send({ error: draft.error });
    const account = await prisma.account.findUnique({ where: { farmId_code: { farmId, code: draft.accountCode } } });
    return reply.send({ draft: { ...draft, accountLabel: account?.label ?? draft.accountLabel } });
  });

  // Receipt Capture: vision parse (Claude) -> DRAFT for confirmation. Without a
  // key, returns a skeleton draft for manual entry (vision flagged off).
  app.post("/farms/:farmId/assistant/receipt", async (req, reply) => {
    const { farmId } = req.params as { farmId: string };
    const parsed = z.object({ imageBase64: z.string().optional(), mediaType: z.string().optional(), filename: z.string().optional() }).safeParse(req.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);

    if (!hasKey() || !parsed.data.imageBase64) {
      const account = await prisma.account.findUnique({ where: { farmId_code: { farmId, code: "supplies" } } });
      return reply.send({
        needsKey: !hasKey(),
        note: hasKey() ? "Attach an image to auto-parse." : "Vision parsing needs an Anthropic API key. Fill in the draft and confirm.",
        draft: { date: new Date().toISOString().slice(0, 10), description: parsed.data.filename ? `Receipt — ${parsed.data.filename}` : "Receipt", amountCents: "0", kind: "EXPENSE", accountCode: "supplies", accountLabel: account?.label ?? "Supplies" },
      });
    }

    const client = new Anthropic();
    const res = await client.messages.create({
      model: MODEL, max_tokens: 1024, system: "Extract the vendor, date (yyyy-mm-dd), total amount in dollars, and a short description from this farm receipt. Respond ONLY with JSON: {\"vendor\":\"\",\"date\":\"\",\"amount\":\"\",\"description\":\"\"}.",
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: (parsed.data.mediaType ?? "image/jpeg") as "image/jpeg", data: parsed.data.imageBase64 } },
        { type: "text", text: "Extract the receipt details as JSON." },
      ] }],
    });
    const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
    let parsedJson: { vendor?: string; date?: string; amount?: string; description?: string } = {};
    try { parsedJson = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); } catch { /* fall through to skeleton */ }
    const code = inferScheduleFCode(parsedJson.description ?? parsedJson.vendor ?? "", false);
    const account = await prisma.account.findUnique({ where: { farmId_code: { farmId, code } } });
    return reply.send({
      draft: {
        date: parsedJson.date || new Date().toISOString().slice(0, 10),
        description: [parsedJson.vendor, parsedJson.description].filter(Boolean).join(" — ") || "Receipt",
        amountCents: parsedJson.amount ? (-BigInt(Math.round(Number(parsedJson.amount) * 100))).toString() : "0",
        kind: "EXPENSE", accountCode: code, accountLabel: account?.label ?? code,
      },
    });
  });
}
