/**
 * Phase 6 reporting (pure, integer cents). Builds P&L, Schedule F summary,
 * cash-flow statement, and enterprise (per-crop/per-herd) profitability from
 * ledger transactions, plus a CSV serializer for export.
 */
import { SCHEDULE_F } from "./schedule-f.js";

export type ReportTxn = {
  amountCents: bigint;
  date: Date;
  account: { code: string; label: string; kind: string; scheduleFCode: string };
};

const inYear = (t: ReportTxn, year: number) => t.date.getUTCFullYear() === year;

export type Line = { code: string; label: string; scheduleFLine?: string; totalCents: bigint };
export type ProfitAndLoss = { year: number; income: Line[]; expenses: Line[]; totalIncomeCents: bigint; totalExpenseCents: bigint; netCents: bigint };

function groupLines(txns: ReportTxn[], sign: "income" | "expense"): Line[] {
  const by = new Map<string, Line>();
  for (const t of txns) {
    const isIncome = t.amountCents > 0n;
    if ((sign === "income") !== isIncome) continue;
    const amt = isIncome ? t.amountCents : -t.amountCents;
    const cur = by.get(t.account.code);
    if (cur) cur.totalCents += amt;
    else by.set(t.account.code, { code: t.account.code, label: t.account.label, scheduleFLine: SCHEDULE_F[t.account.scheduleFCode]?.line, totalCents: amt });
  }
  return [...by.values()].sort((a, b) => Number(b.totalCents - a.totalCents));
}

export function profitAndLoss(txns: ReportTxn[], year: number): ProfitAndLoss {
  const yr = txns.filter((t) => inYear(t, year));
  const income = groupLines(yr, "income");
  const expenses = groupLines(yr, "expense");
  const totalIncomeCents = income.reduce((s, l) => s + l.totalCents, 0n);
  const totalExpenseCents = expenses.reduce((s, l) => s + l.totalCents, 0n);
  return { year, income, expenses, totalIncomeCents, totalExpenseCents, netCents: totalIncomeCents - totalExpenseCents };
}

export type ScheduleFLineRow = { line: string; label: string; totalCents: bigint };
export type ScheduleFSummary = { year: number; income: ScheduleFLineRow[]; expenses: ScheduleFLineRow[]; totalIncomeCents: bigint; totalExpenseCents: bigint; netFarmProfitCents: bigint };

/** Group by Schedule F line for the tax-ready summary. */
export function scheduleFSummary(txns: ReportTxn[], year: number): ScheduleFSummary {
  const incomeBy = new Map<string, ScheduleFLineRow>();
  const expenseBy = new Map<string, ScheduleFLineRow>();
  for (const t of txns.filter((t) => inYear(t, year))) {
    const sf = SCHEDULE_F[t.account.scheduleFCode];
    if (!sf) continue;
    const isIncome = t.amountCents > 0n;
    const target = isIncome ? incomeBy : expenseBy;
    const amt = isIncome ? t.amountCents : -t.amountCents;
    const key = sf.line;
    const cur = target.get(key);
    if (cur) cur.totalCents += amt;
    else target.set(key, { line: sf.line, label: sf.label, totalCents: amt });
  }
  const income = [...incomeBy.values()].sort((a, b) => a.line.localeCompare(b.line));
  const expenses = [...expenseBy.values()].sort((a, b) => a.line.localeCompare(b.line));
  const totalIncomeCents = income.reduce((s, l) => s + l.totalCents, 0n);
  const totalExpenseCents = expenses.reduce((s, l) => s + l.totalCents, 0n);
  return { year, income, expenses, totalIncomeCents, totalExpenseCents, netFarmProfitCents: totalIncomeCents - totalExpenseCents };
}

export type CashFlowMonth = { month: number; inflowCents: bigint; outflowCents: bigint; netCents: bigint };
export type CashFlowStatement = { year: number; months: CashFlowMonth[]; inflowCents: bigint; outflowCents: bigint; netCents: bigint };

export function cashFlowStatement(txns: ReportTxn[], year: number): CashFlowStatement {
  const months: CashFlowMonth[] = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, inflowCents: 0n, outflowCents: 0n, netCents: 0n }));
  for (const t of txns.filter((t) => inYear(t, year))) {
    const m = months[t.date.getUTCMonth()]!;
    if (t.amountCents > 0n) m.inflowCents += t.amountCents;
    else m.outflowCents += -t.amountCents;
  }
  for (const m of months) m.netCents = m.inflowCents - m.outflowCents;
  const inflowCents = months.reduce((s, m) => s + m.inflowCents, 0n);
  const outflowCents = months.reduce((s, m) => s + m.outflowCents, 0n);
  return { year, months, inflowCents, outflowCents, netCents: inflowCents - outflowCents };
}

// Map Schedule F categories to farm enterprises for per-crop/per-herd P&L.
const ENTERPRISE_OF: Record<string, string> = {
  livestock_sales_raised: "Livestock", livestock_sales_bought: "Livestock", feed: "Livestock", veterinary: "Livestock",
  crop_sales: "Crops", seeds_plants: "Crops", fertilizer: "Crops",
};
export type Enterprise = { name: string; incomeCents: bigint; expenseCents: bigint; netCents: bigint };

/** Direct-cost enterprise profitability; unallocated rows fall to "Overhead". */
export function enterpriseProfitability(txns: ReportTxn[], year: number): Enterprise[] {
  const by = new Map<string, Enterprise>();
  const get = (name: string) => by.get(name) ?? (by.set(name, { name, incomeCents: 0n, expenseCents: 0n, netCents: 0n }), by.get(name)!);
  for (const t of txns.filter((t) => inYear(t, year))) {
    const name = ENTERPRISE_OF[t.account.code] ?? "Overhead";
    const e = get(name);
    if (t.amountCents > 0n) e.incomeCents += t.amountCents;
    else e.expenseCents += -t.amountCents;
  }
  const order = ["Livestock", "Crops", "Overhead"];
  return [...by.values()].map((e) => ({ ...e, netCents: e.incomeCents - e.expenseCents })).sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
}

// ---------- CSV ----------
/** Plain dollar decimal (no $ or commas) for spreadsheet-friendly export. */
export function centsToDecimal(cents: bigint): string {
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  return `${neg ? "-" : ""}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
}

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
export function toCsv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map((c) => csvCell(String(c))).join(",")).join("\n");
}
