/**
 * Phase 7 assistant — pure pieces of the grounded AI layer (Flint):
 *  - parseQuickLog: natural-language transaction → draft (never posts directly)
 *  - classifyChat: route a question to the ledger tool that answers it
 *
 * Grounding (Invariant 3) is enforced at the API layer: every figure the
 * assistant states comes from a tool that reads the real ledger. These helpers
 * never invent numbers — parseQuickLog only extracts what the user typed.
 */
import { toCents } from "./money.js";
import { inferScheduleFCode, scheduleFLabel } from "./import.js";

export type QuickLogDraft = {
  date: string;            // ISO yyyy-mm-dd
  description: string;
  amountCents: string;     // signed integer cents
  kind: "INCOME" | "EXPENSE";
  accountCode: string;     // inferred Schedule F category
  accountLabel: string;
  relatedLabel?: string;
};

const INCOME_HINTS = ["sold", "sale", "sell", "received", "deposit", "income", "revenue", "payment from", "paid me"];
const EXPENSE_HINTS = ["bought", "buy", "paid", "purchase", "spent", "bill", "expense"];

/** Extract a draft transaction from plain English. Returns an error string if
 *  no amount is present. The draft must be confirmed before it is written. */
export function parseQuickLog(text: string, today: string): QuickLogDraft | { error: string } {
  // Prefer a $-prefixed amount; otherwise the largest number in the text
  // (avoids grabbing quantities like "5 head").
  const dollar = text.match(/\$\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/);
  let amountStr = dollar?.[1];
  if (!amountStr) {
    const nums = [...text.matchAll(/([0-9][0-9,]*(?:\.[0-9]{1,2})?)/g)].map((x) => x[1]!);
    if (nums.length) amountStr = nums.reduce((a, b) => (toCents(b) > toCents(a) ? b : a));
  }
  if (!amountStr) return { error: "I couldn't find an amount. Try e.g. \"sold 5 head of cattle for $6,730\"." };

  const magnitude = toCents(amountStr);
  const lower = text.toLowerCase();
  const income = INCOME_HINTS.some((h) => lower.includes(h)) && !EXPENSE_HINTS.some((h) => lower.includes(h));
  const amountCents = (income ? magnitude : -magnitude).toString();
  const code = inferScheduleFCode(text, income);

  return {
    date: today,
    description: text.trim().replace(/\s+/g, " "),
    amountCents,
    kind: income ? "INCOME" : "EXPENSE",
    accountCode: code,
    accountLabel: scheduleFLabel(code),
  };
}

export type ChatIntent = "summary" | "transactions" | "obligations" | "inventory" | "budgets" | "schedule_f" | "alerts";

/** Map a question to the ledger tool that should answer it (deterministic
 *  fallback when no LLM key is configured). */
export function classifyChat(message: string): ChatIntent {
  const m = message.toLowerCase();
  if (/(transaction|recent activity|history|last few|what did i (spend|buy))/.test(m)) return "transactions";
  if (/(alert|overdue|expired|lapsed|reminder|warning|attention|flag)/.test(m)) return "alerts";
  if (/(owe|payment|due|obligation|loan|lease|rent|amorti|liabilit|upcoming expense)/.test(m)) return "obligations";
  if (/(inventory|market|ready (for|to)|sell|livestock|crop|cattle|wheat|bushel|head)/.test(m)) return "inventory";
  if (/(budget|over.?budget|on track|spending vs|feed budget)/.test(m)) return "budgets";
  if (/(tax|schedule ?f|deduct|write.?off|irs|profit for the year)/.test(m)) return "schedule_f";
  return "summary"; // cash position / net worth / "how am I doing"
}
