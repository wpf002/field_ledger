import type { FastifyInstance } from "fastify";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@fl/db";
import { z } from "zod";
import { verifyToken, tokenFromRequest, roleForFarm } from "../lib/session.js";
import { planFor } from "../lib/plan.js";
import { classifyChat, parseQuickLog, formatCentsDisplay, inferScheduleFCode, toolAllowed } from "@fl/core";
import {
  LEDGER_TOOLS, TOOL_TIER, financialSummary, recentTransactions, upcomingObligations,
  marketableInventory, budgetStatuses, scheduleFReport, alertsList,
  financialHealth, cashForecast, enterpriseProfitability, accountsReceivable, financialBrief, marketResearchEnabled,
} from "../lib/ledger-tools.js";

const MODEL = process.env.FLINT_MODEL || "claude-opus-5-5";
const hasKey = () => !!process.env.ANTHROPIC_API_KEY;
const fmt = (cents: string) => formatCentsDisplay(BigInt(cents), { sign: false });

const SYSTEM = `You are Flint, the assistant for the Acreflow farm accounting app.
Answer questions about the farm's finances ONLY using the provided tools, which return the user's real ledger data.
Every number you state MUST come from a tool result — never estimate, guess, or invent figures.
Use the most specific tool: enterprise, crop, and livestock profitability for "what makes money"; cash_forecast for "how much cash in July"; run_scenario for "what if prices fall 20%" or "can I buy this tractor"; accounts_receivable for who owes money.
Tool results cover only the records each tool returns; don't extrapolate beyond them.
If the data needed to answer isn't available from the tools, say so plainly. Be concise and practical. Money is in integer cents; format it as dollars.
Respond in plain text for a chat bubble: short sentences and simple "• " bullet lists. Do NOT use markdown tables, pipes, or "#" headers.`;

const ANTHROPIC_TOOLS: Anthropic.Tool[] = [
  { name: "financial_summary", description: "Revenue, expenses, and net farm income (accrual) year-to-date, or for a full past year when `year` is given; plus inventory value, liabilities, and net worth at market at the period end.", input_schema: { type: "object", properties: { year: { type: "integer", description: "A completed calendar year. Omit for year-to-date." } } } },
  { name: "recent_transactions", description: "The most recent ledger transactions.", input_schema: { type: "object", properties: { limit: { type: "integer" } } } },
  { name: "upcoming_obligations", description: "Loan and lease payments due within a window of days.", input_schema: { type: "object", properties: { days: { type: "integer" } } } },
  { name: "marketable_inventory", description: "Livestock and crops available to sell, valued at current market prices.", input_schema: { type: "object", properties: {} } },
  { name: "budget_status", description: "Budget vs actual spend per category.", input_schema: { type: "object", properties: {} } },
  { name: "schedule_f", description: "Schedule F tax summary (gross income, expenses, net farm profit) for a year.", input_schema: { type: "object", properties: { year: { type: "integer" } } } },
  { name: "alerts", description: "Active alerts: overdue invoices, expired leases, upcoming payments, budget overages.", input_schema: { type: "object", properties: {} } },
  { name: "cash_position", description: "Cash, operating line balance and availability, working capital, receivables, and payables at the reporting date.", input_schema: { type: "object", properties: {} } },
  { name: "cash_forecast", description: "13-week and 12-month cash forecast: ending cash by month, line balance, low point, and whether cash falls below the reserve.", input_schema: { type: "object", properties: { scenario: { type: "string", enum: ["base", "optimistic", "downside"] } } } },
  { name: "enterprise_profitability", description: "Profit and loss by enterprise (business unit) for a year: revenue, transfers, direct costs, gross profit, overhead, net income.", input_schema: { type: "object", properties: { year: { type: "integer" } } } },
  { name: "crop_profitability", description: "Per-acre economics for each crop season in a year: yield, price, revenue, cost, profit per acre, break-even yield and price.", input_schema: { type: "object", properties: { year: { type: "integer" } } } },
  { name: "livestock_profitability", description: "Per-head (or per-unit) economics for livestock enterprises in a year: revenue, cost, feed, and profit per unit.", input_schema: { type: "object", properties: { year: { type: "integer" } } } },
  { name: "debt_summary", description: "Every loan (balance, rate, payment, maturity) plus debt ratios, term debt coverage, and repayment margin.", input_schema: { type: "object", properties: {} } },
  { name: "inventory_position", description: "Inventory on hand at the reporting date: quantity, cost basis, market value, and expected use or sale.", input_schema: { type: "object", properties: {} } },
  { name: "accounts_receivable", description: "Open customer invoices with balances and due dates, and receivables aging buckets.", input_schema: { type: "object", properties: {} } },
  { name: "financial_health", description: "Health score (0-100) by liquidity, solvency, profitability, repayment capacity, and efficiency, with the underlying ratios.", input_schema: { type: "object", properties: {} } },
  { name: "insights", description: "Findings about the operation from the books (risks, opportunities, trends), each with a recommendation and its data sources.", input_schema: { type: "object", properties: {} } },
  { name: "financial_brief", description: "The weekly or monthly financial brief: health, cash outlook, plan variance, lowest-margin enterprise, line peak, and recommended actions.", input_schema: { type: "object", properties: { kind: { type: "string", enum: ["weekly", "monthly"] } } } },
  { name: "run_scenario", description: "What-if over the next 12 months: change prices, volume, or costs (percent), add an equipment purchase, or a new hire, and compare profit, cash, line, debt, and health before vs after. Read-only; nothing is saved.", input_schema: { type: "object", properties: { pricePct: { type: "number" }, volumePct: { type: "number" }, costPct: { type: "number" }, equipmentPrice: { type: "number" }, downPayment: { type: "number" }, ratePct: { type: "number" }, years: { type: "integer" }, hireAnnualWage: { type: "number" } } } },
  { name: "commodity_exposure", description: "Crop marketing position by commodity and crop year: expected production, sold, contracted, priced, unpriced share, market price, value of unpriced bushels, and open forward/HTA/basis contracts.", input_schema: { type: "object", properties: {} } },
  { name: "sell_or_hold", description: "Sell stored grain or hay now or hold it: compares selling at today's price with a later price after storage, shrink, and interest. Defaults come from inventory and the operating line; pass priceLater (and months) to test a price.", input_schema: { type: "object", properties: { item: { type: "string" }, quantity: { type: "number" }, priceNow: { type: "number" }, priceLater: { type: "number" }, months: { type: "integer" }, storagePerUnitMonth: { type: "number" }, interestPct: { type: "number" }, shrinkPct: { type: "number" } } } },
  { name: "set_budget", description: "Save a budget amount (dollars) for one income or expense category, for a year or one month. Only when the user asks to set or change a budget.", input_schema: { type: "object", properties: { category: { type: "string" }, amount: { type: "number" }, year: { type: "integer" }, month: { type: "integer" } }, required: ["category", "amount"] } },
  { name: "save_scenario", description: "Save a what-if (same inputs as run_scenario) to the farm's scenario list with a short question. Only when the user asks to save it.", input_schema: { type: "object", properties: { question: { type: "string" }, pricePct: { type: "number" }, volumePct: { type: "number" }, costPct: { type: "number" }, equipmentPrice: { type: "number" }, downPayment: { type: "number" }, ratePct: { type: "number" }, years: { type: "integer" }, hireAnnualWage: { type: "number" } }, required: ["question"] } },
  { name: "add_note", description: "Save a note for the farm (decisions, reminders, follow-ups). Only when the user asks to note or remember something.", input_schema: { type: "object", properties: { body: { type: "string" }, entity: { type: "string" }, entityId: { type: "string" } }, required: ["body"] } },
  { name: "market_research", description: "Current outside market information from the web (cash prices, futures, basis, weather, policy) for a specific question. Send only the market question, with commodity and location. Never include the farm's own figures, names, or records.", input_schema: { type: "object", properties: { question: { type: "string" } }, required: ["question"] } },
];

/** Tools a role may use: viewers read; everyone else may also run forecasts and scenarios. */
const toolsFor = (role: string | null, plan: string) => ANTHROPIC_TOOLS.filter((t) =>
  (t.name !== "market_research" || marketResearchEnabled()) && toolAllowed(plan, TOOL_TIER[t.name] ?? "read", t.name) &&
  (TOOL_TIER[t.name] === "read" || (role != null && role !== "VIEWER" && (TOOL_TIER[t.name] !== "write" || ["OWNER", "ADMIN", "MEMBER"].includes(role)))));

/** Grounded answer without an LLM: route to a tool, format its real figures. */
async function chatDeterministic(farmId: string, message: string) {
  const intent = classifyChat(message);
  let answer = "";
  if (intent === "summary") {
    const s = await financialSummary(farmId);
    answer = `Year to date through ${s.asOf}: revenue ${fmt(s.incomeCents)}, expenses ${fmt(s.expenseCents)}, net farm income ${fmt(s.netProfitCents)}. Inventory and livestock are valued at ${fmt(s.inventoryValueCents)}; liabilities total ${fmt(s.liabilitiesCents)}; net worth at market is ${fmt(s.netWorthCents)}.`;
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
  } else if (intent === "health") {
    const h = await financialHealth(farmId);
    answer = `Financial health is ${h.status} (${h.overall}/100) as of ${h.asOf}:\n${h.categories.map((c) => `• ${c.category}: ${c.status} (${c.score})`).join("\n")}`;
  } else if (intent === "forecast") {
    const f = await cashForecast(farmId);
    const low = f.months.reduce((a, m) => (BigInt(m.endingCashCents) < BigInt(a.endingCashCents) ? m : a), f.months[0]!);
    answer = `Base forecast from ${f.asOf}:\n${f.months.map((m) => `• ${m.monthEnd.slice(0, 7)}: cash ${fmt(m.endingCashCents)}, line ${fmt(m.lineBalanceCents)}`).join("\n")}\nLow point ${fmt(low.endingCashCents)} at ${low.monthEnd.slice(0, 7)}.`;
  } else if (intent === "enterprises") {
    const e = await enterpriseProfitability(farmId);
    const rows = e.enterprises.filter((x) => x.enterprise !== "Unassigned").sort((a, b) => Number(BigInt(b.netIncomeCents) - BigInt(a.netIncomeCents)));
    answer = `Net income by enterprise, ${e.year} through ${e.through}:\n${rows.map((x) => `• ${x.enterprise}: ${formatCentsDisplay(BigInt(x.netIncomeCents), { sign: true })} on ${fmt(x.revenueCents)} revenue`).join("\n")}`;
  } else if (intent === "receivables") {
    const r = await accountsReceivable(farmId);
    answer = r.invoices.length ? `Open invoices as of ${r.asOf}:\n${r.invoices.slice(0, 8).map((i) => `• ${i.customer}: ${fmt(i.balanceCents)} (due ${i.due})`).join("\n")}` : "No one owes you money right now.";
  } else if (intent === "brief") {
    const b = await financialBrief(farmId);
    answer = `${b.lines.join("\n")}${b.actions.length ? `\nRecommended:\n${b.actions.map((a) => `• ${a}`).join("\n")}` : ""}`;
  } else {
    const a = await alertsList(farmId);
    answer = a.length ? `You have ${a.length} active alert${a.length === 1 ? "" : "s"}:\n${a.map((x) => `• [${x.severity}] ${x.title} — ${x.message}`).join("\n")}` : "You're all caught up — no active alerts.";
  }
  return { answer, mode: "deterministic" as const, tool: intent };
}

/**
 * The conversation with one cache breakpoint on its newest block.
 *
 * Every step of the tool loop re-sends everything before it — tools, system, the
 * question, and each earlier tool call and result. Without a breakpoint all of that
 * is billed at full input price on every step. With one on the newest block, the
 * next step reads it back at ~0.1x.
 *
 * The marker moves rather than accumulates: markers are not part of the cached
 * bytes, so moving one invalidates nothing, and leaving each step's marker in place
 * would pass the API's four-breakpoint limit on a long loop. History is copied, not
 * mutated, so the stored transcript never carries a marker.
 *
 * Break-even: a two-step answer pays a small write it never reads; each step past
 * that reads the whole prefix back. It comes out ahead once more than about a
 * quarter of questions take three or more steps.
 */
function withTailBreakpoint(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  const last = messages[messages.length - 1];
  if (!last || typeof last.content === "string" || last.content.length === 0) return messages;
  const blocks = [...last.content];
  const tail = blocks[blocks.length - 1]!;
  blocks[blocks.length - 1] = { ...tail, cache_control: { type: "ephemeral" } } as typeof tail;
  return [...messages.slice(0, -1), { ...last, content: blocks }];
}

/** Grounded answer via Claude tool-calling over the same ledger tools. */
async function chatClaude(farmId: string, message: string, role: string | null) {
  const tools = toolsFor(role, await planFor(farmId));
  const allowed = new Set(tools.map((t) => t.name));
  const client = new Anthropic();
  // Block form from the start, so the question renders identically whether or not
  // it currently carries the breakpoint.
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: [{ type: "text", text: message }] }];
  // The books' reporting date anchors "this year" and "last year"; it goes after the static prompt.
  const farm = await prisma.farm.findUnique({ where: { id: farmId }, select: { reportCutoff: true } });
  const asOf = farm?.reportCutoff ?? new Date();
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: SYSTEM },
    { type: "text", text: `The books run through ${asOf.toISOString().slice(0, 10)}. "This year" means ${asOf.getUTCFullYear()} year-to-date; "last year" means calendar ${asOf.getUTCFullYear() - 1}.` },
  ];
  for (let i = 0; i < 6; i++) {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system,
      tools,
      messages: withTailBreakpoint(messages),
    });
    if (res.stop_reason !== "tool_use") {
      const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
      return { answer: text, mode: "claude" as const, model: MODEL };
    }
    messages.push({ role: "assistant", content: res.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of res.content) {
      if (block.type === "tool_use") {
        const handler = allowed.has(block.name) ? LEDGER_TOOLS[block.name] : undefined;
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
      const v = verifyToken(tokenFromRequest(req));
      const role = v ? await roleForFarm(v.userId, farmId) : null;
      return hasKey() ? await chatClaude(farmId, parsed.data.message, role) : await chatDeterministic(farmId, parsed.data.message);
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

    let parsedJson: { vendor?: string; date?: string; amount?: string; description?: string } = {};
    try {
      const client = new Anthropic();
      const res = await client.messages.create({
        model: MODEL, max_tokens: 1024, system: "Extract the vendor, date (yyyy-mm-dd), total amount in dollars, and a short description from this farm receipt. Respond ONLY with JSON: {\"vendor\":\"\",\"date\":\"\",\"amount\":\"\",\"description\":\"\"}.",
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: (parsed.data.mediaType ?? "image/jpeg") as "image/jpeg", data: parsed.data.imageBase64 } },
          { type: "text", text: "Extract the receipt details as JSON." },
        ] }],
      });
      const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
      parsedJson = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    } catch (e) {
      // Vision call or JSON parse failed — return a skeleton draft to fill in by hand.
      const account = await prisma.account.findUnique({ where: { farmId_code: { farmId, code: "supplies" } } });
      return reply.send({
        note: "Couldn't read the receipt automatically — please fill in the draft.",
        error: e instanceof Error ? e.message : "vision error",
        draft: { date: new Date().toISOString().slice(0, 10), description: "Receipt", amountCents: "0", kind: "EXPENSE", accountCode: "supplies", accountLabel: account?.label ?? "Supplies" },
      });
    }

    const amount = Number(parsedJson.amount);
    const amountCents = Number.isFinite(amount) && amount > 0 ? (-BigInt(Math.round(amount * 100))).toString() : "0";
    const code = inferScheduleFCode(parsedJson.description ?? parsedJson.vendor ?? "", false);
    const account = await prisma.account.findUnique({ where: { farmId_code: { farmId, code } } });
    return reply.send({
      draft: {
        date: parsedJson.date || new Date().toISOString().slice(0, 10),
        description: [parsedJson.vendor, parsedJson.description].filter(Boolean).join(" — ") || "Receipt",
        amountCents,
        kind: "EXPENSE", accountCode: code, accountLabel: account?.label ?? code,
      },
    });
  });
}
