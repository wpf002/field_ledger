/**
 * Forward-looking cash and profit (Roadmap 2, Phase 14).
 *
 * Every forecast line has a source:
 *  - "open item"     invoices and bills open at the as-of date, on their expected dates (exact)
 *  - "loan schedule" scheduled interest and principal (exact)
 *  - "operating plan" last year's same-period flows, scaled by scenario drivers
 *  - "line"          operating-line draws/repayments to hold the reserve target, plus line interest
 * Depreciation in the profit forecast comes from the asset register (exact).
 */
import type { StatementRow, LoanRec, AssetRec, IncomeStatement } from "./statements.js";
import { netBookValue } from "./statements.js";
import { fromSections } from "./enterprise.js";

const DAY = 86_400_000;
const t = (d: Date) => d.getTime();
const addDays = (d: Date, n: number) => new Date(t(d) + n * DAY);
const monthEnd = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0));
const scale = (c: bigint, f: number) => BigInt(Math.round(Number(c) * f));

export type Drivers = {
  pricePct: number;          // revenue price change vs last year (0.05 = +5%)
  volumePct: number;         // revenue volume change; variable costs follow volume
  costInflationPct: number;  // input and overhead cost change
  byEnterprise?: Record<string, { pricePct?: number; volumePct?: number }>;
};
export type ScenarioKey = "base" | "optimistic" | "downside";
export const DEFAULT_SCENARIOS: Record<ScenarioKey, { label: string; drivers: Drivers }> = {
  base: { label: "Base", drivers: { pricePct: 0, volumePct: 0, costInflationPct: 0.03 } },
  optimistic: { label: "Optimistic", drivers: { pricePct: 0.08, volumePct: 0.05, costInflationPct: 0.02 } },
  downside: { label: "Downside", drivers: { pricePct: -0.12, volumePct: -0.15, costInflationPct: 0.05 } },
};

export type LineTerms = { limitCents: bigint; ratePct: number; balanceCents: bigint };
export type ForecastInputs = {
  rows: StatementRow[];
  asOf: Date;
  cashCents: bigint;            // cash at the as-of date
  loans: LoanRec[];
  assets: AssetRec[];
  line: LineTerms | null;
  reserveCents: bigint;         // minimum cash target
  drivers: Drivers;
};

const revFactor = (d: Drivers, ent: string | null | undefined) => {
  const e = ent ? d.byEnterprise?.[ent] : undefined;
  return (1 + (e?.pricePct ?? d.pricePct)) * (1 + (e?.volumePct ?? d.volumePct));
};
const costFactor = (d: Drivers, ent: string | null | undefined, variable: boolean) => {
  const e = ent ? d.byEnterprise?.[ent] : undefined;
  return (1 + d.costInflationPct) * (variable ? 1 + (e?.volumePct ?? d.volumePct) : 1);
};

// ---------- cash items ----------
export type CashItem = { date: Date; group: string; source: "open item" | "loan schedule" | "operating plan" | "line"; description: string; cents: bigint; enterpriseId?: string | null; accountCode?: string };

/** Invoices and bills open at `asOf` that are expected to settle in (asOf, end]. */
export function openItemFlows(rows: (StatementRow & { expectedCashDate?: Date | null; description?: string })[], asOf: Date, end: Date): CashItem[] {
  const out: CashItem[] = [];
  for (const r of rows) {
    if (r.cashDate || !r.expectedCashDate || r.section === "CASHBS" || r.entryType === "adjustment") continue;
    if (t(r.date) > t(asOf) || t(r.expectedCashDate) <= t(asOf) || t(r.expectedCashDate) > t(end)) continue;
    const rev = r.section === "REV";
    out.push({ date: r.expectedCashDate, group: rev ? "Collections - invoices outstanding" : "Payment of AP/accruals outstanding", source: "open item", description: r.description ?? "", cents: r.amountCents, enterpriseId: r.enterpriseId, accountCode: r.accountCode });
  }
  return out;
}

/** Scheduled term-loan interest and principal due in (asOf, end]. */
export function scheduledDebtFlows(loans: (LoanRec & { name?: string })[], asOf: Date, end: Date): CashItem[] {
  const out: CashItem[] = [];
  for (const l of loans) {
    if (l.isLine) continue;
    for (const s of l.schedule) {
      if (t(s.dueDate) <= t(asOf) || t(s.dueDate) > t(end)) continue;
      const interest = (s.paymentCents ?? s.principalCents) - s.principalCents;
      if (interest) out.push({ date: s.dueDate, group: "Scheduled debt payments", source: "loan schedule", description: `${l.name ?? "Loan"} interest`, cents: -interest });
      if (s.principalCents) out.push({ date: s.dueDate, group: "Scheduled debt payments", source: "loan schedule", description: `${l.name ?? "Loan"} principal`, cents: -s.principalCents });
    }
  }
  return out;
}

/** Insurance indemnities and ad-hoc program payments are events, not a seasonal pattern. */
const NON_RECURRING_ACCOUNTS = new Set(["4200", "4210"]);
const PLAN_EXCLUDE = new Set(["Debt payments - interest", "Debt payments - principal", "Operating line draws", "Operating line repayments", "Loan proceeds", "Asset sale proceeds", "Equipment & capital purchases"]);
const RECEIPT = (r: StatementRow) => r.section === "REV";

/**
 * Operating plan for (asOf, end]: what moved through the bank in the same window a year
 * earlier, for items earned after last year's as-of date (so last year's receivable
 * run-off isn't counted twice), shifted forward 364 days and scaled by the drivers.
 */
export function operatingPlanFlows(rows: StatementRow[], asOf: Date, end: Date, drivers: Drivers): CashItem[] {
  const shift = 364;
  const from = addDays(asOf, -shift), to = addDays(end, -shift);
  const out: CashItem[] = [];
  for (const r of rows) {
    if (!r.cashDate || r.cashEffectCents == null || t(r.cashDate) <= t(from) || t(r.cashDate) > t(to)) continue;
    if (t(r.date) <= t(from)) continue;
    const cls = r.cashFlowClass ?? "Other";
    if (PLAN_EXCLUDE.has(cls) || NON_RECURRING_ACCOUNTS.has(r.accountCode)) continue;
    const variable = r.section === "COP";
    const f = RECEIPT(r) ? revFactor(drivers, r.enterpriseId) : r.section === "CASHBS" ? 1 : costFactor(drivers, r.enterpriseId, variable);
    out.push({ date: addDays(r.cashDate, shift), group: cls, source: "operating plan", description: cls, cents: scale(r.cashEffectCents, f), enterpriseId: r.enterpriseId, accountCode: r.accountCode });
  }
  return out;
}

// ---------- period roll with operating line ----------
export type CashPeriod = {
  start: Date; end: Date; beginningCashCents: bigint; receiptsCents: bigint; disbursementsCents: bigint;
  drawsCents: bigint; repaymentsCents: bigint; lineInterestCents: bigint; endingCashCents: bigint; lineBalanceCents: bigint;
  byGroup: Map<string, bigint>;
};

/** Roll items into periods; draw on the line to hold the reserve, repay when cash allows. */
export function rollCash(items: CashItem[], periods: { start: Date; end: Date }[], cashCents: bigint, line: LineTerms | null, reserveCents: bigint, interestPerPeriod: (balance: bigint) => bigint): CashPeriod[] {
  let cash = cashCents, bal = line?.balanceCents ?? 0n;
  return periods.map((p) => {
    const inP = items.filter((i) => t(i.date) > t(p.start) && t(i.date) <= t(p.end));
    const byGroup = new Map<string, bigint>();
    for (const i of inP) byGroup.set(i.group, (byGroup.get(i.group) ?? 0n) + i.cents);
    const receipts = inP.filter((i) => i.cents > 0n).reduce((s, i) => s + i.cents, 0n);
    const disb = inP.filter((i) => i.cents < 0n).reduce((s, i) => s + i.cents, 0n);
    const lineInterest = line ? interestPerPeriod(bal) : 0n;
    const beginning = cash;
    let ending = cash + receipts + disb - lineInterest;
    let draws = 0n, repay = 0n;
    if (line) {
      if (ending < reserveCents) { draws = min(reserveCents - ending, line.limitCents - bal); if (draws < 0n) draws = 0n; }
      else if (bal > 0n) { repay = min(ending - reserveCents, bal); }
      // Round line activity to whole $1,000s, as banks advance it.
      draws = roundUp(draws, 100_000n); repay = roundDown(repay, 100_000n);
      if (bal + draws > line.limitCents) draws = line.limitCents - bal;
      bal += draws - repay; ending += draws - repay;
    }
    cash = ending;
    return { start: p.start, end: p.end, beginningCashCents: beginning, receiptsCents: receipts, disbursementsCents: disb, drawsCents: draws, repaymentsCents: repay, lineInterestCents: lineInterest, endingCashCents: ending, lineBalanceCents: bal, byGroup };
  });
}
const min = (a: bigint, b: bigint) => (a < b ? a : b);
const roundUp = (x: bigint, u: bigint) => (x <= 0n ? 0n : ((x + u - 1n) / u) * u);
const roundDown = (x: bigint, u: bigint) => (x <= 0n ? 0n : (x / u) * u);

// ---------- 13-week ----------
export type ThirteenWeek = { weeks: CashPeriod[]; items: CashItem[]; minimum: { week: number; cents: bigint }; reserveBreach: { week: number; start: Date; cents: bigint } | null };

export function thirteenWeekForecast(inp: ForecastInputs & { rows: (StatementRow & { expectedCashDate?: Date | null; description?: string })[]; loans: (LoanRec & { name?: string })[] }): ThirteenWeek {
  const end = addDays(inp.asOf, 91);
  const items = [...openItemFlows(inp.rows, inp.asOf, end), ...scheduledDebtFlows(inp.loans, inp.asOf, end), ...operatingPlanFlows(inp.rows, inp.asOf, end, inp.drivers)];
  const periods = Array.from({ length: 13 }, (_, i) => ({ start: addDays(inp.asOf, i * 7), end: addDays(inp.asOf, (i + 1) * 7) }));
  const rate = inp.line?.ratePct ?? 0;
  const weeks = rollCash(items, periods, inp.cashCents, inp.line, inp.reserveCents, (b) => scale(b, rate / 100 / 52));
  let minimum = { week: 1, cents: weeks[0]?.endingCashCents ?? inp.cashCents };
  weeks.forEach((w, i) => { if (w.endingCashCents < minimum.cents) minimum = { week: i + 1, cents: w.endingCashCents }; });
  // Breach = cash before line support would fall below the reserve.
  let breach: ThirteenWeek["reserveBreach"] = null;
  for (let i = 0; i < weeks.length && !breach; i++) {
    const w = weeks[i]!;
    const preLine = w.endingCashCents - w.drawsCents + w.repaymentsCents;
    if (preLine < inp.reserveCents) breach = { week: i + 1, start: addDays(w.start, 1), cents: preLine };
  }
  return { weeks, items, minimum, reserveBreach: breach };
}

// ---------- 12-month ----------
export type MonthForecast = { monthEnd: Date; pnl: IncomeStatement; cash: CashPeriod };

/** Profit: last year's same month by enterprise and section, scaled by drivers; depreciation from the register. */
export function profitForecast(rows: StatementRow[], assets: AssetRec[], loans: LoanRec[], asOf: Date, drivers: Drivers, months = 12): IncomeStatement[] {
  const out: IncomeStatement[] = [];
  for (let i = 1; i <= months; i++) {
    const to = monthEnd(asOf.getUTCFullYear(), asOf.getUTCMonth() + i), from = monthEnd(to.getUTCFullYear(), to.getUTCMonth() - 1);
    const pTo = monthEnd(to.getUTCFullYear() - 1, to.getUTCMonth()), pFrom = monthEnd(pTo.getUTCFullYear(), pTo.getUTCMonth() - 1);
    const g: Record<string, bigint> = {};
    for (const r of rows) {
      if (t(r.date) <= t(pFrom) || t(r.date) > t(pTo)) continue;
      if (!["REV", "COP", "OVH", "XFER"].includes(r.section) || NON_RECURRING_ACCOUNTS.has(r.accountCode)) continue;
      const f = r.section === "REV" ? revFactor(drivers, r.enterpriseId) : r.section === "XFER" ? 1 : costFactor(drivers, r.enterpriseId, r.section === "COP");
      g[r.section] = (g[r.section] ?? 0n) + scale(r.amountCents, f);
    }
    // Depreciation: change in book value of depreciable assets held through the month.
    let dep = 0n;
    for (const a of assets) if (a.category !== "Land" && a.usefulLifeYears && t(a.purchasedAt) <= t(from)) dep += netBookValue(a, from) - netBookValue(a, to);
    g.DEP = -dep;
    // Interest: scheduled term interest due in the month (a cash-basis proxy for accrual).
    let int = 0n;
    for (const l of loans) for (const s of l.schedule) if (!l.isLine && t(s.dueDate) > t(from) && t(s.dueDate) <= t(to)) int += (s.paymentCents ?? s.principalCents) - s.principalCents;
    g.INT = -int;
    out.push(fromSections(g));
  }
  return out;
}

export function twelveMonthForecast(inp: ForecastInputs & { rows: (StatementRow & { expectedCashDate?: Date | null; description?: string })[]; loans: (LoanRec & { name?: string })[] }): MonthForecast[] {
  const end = monthEnd(inp.asOf.getUTCFullYear(), inp.asOf.getUTCMonth() + 12);
  const items = [...openItemFlows(inp.rows, inp.asOf, end), ...scheduledDebtFlows(inp.loans, inp.asOf, end), ...operatingPlanFlows(inp.rows, inp.asOf, end, inp.drivers)];
  const periods = Array.from({ length: 12 }, (_, i) => ({ start: monthEnd(inp.asOf.getUTCFullYear(), inp.asOf.getUTCMonth() + i), end: monthEnd(inp.asOf.getUTCFullYear(), inp.asOf.getUTCMonth() + i + 1) }));
  const rate = inp.line?.ratePct ?? 0;
  const cash = rollCash(items, periods, inp.cashCents, inp.line, inp.reserveCents, (b) => scale(b, rate / 100 / 12));
  const pnl = profitForecast(inp.rows, inp.assets, inp.loans, inp.asOf, inp.drivers);
  return cash.map((c, i) => {
    const p = pnl[i]!;
    // Line interest is a forecast cost too.
    const withLine = fromSections({ REV: p.revenueCents, XFER: p.transfersCents, COP: -p.copCents, OVH: -p.overheadCents, DEP: -p.depreciationCents, INT: -(p.interestCents + c.lineInterestCents) });
    return { monthEnd: c.end, pnl: withLine, cash: c };
  });
}

/** Mean absolute percentage error between forecast and actual totals (ignores zero actuals). */
export function mape(pairs: { forecast: bigint; actual: bigint }[]): number | null {
  const v = pairs.filter((p) => p.actual !== 0n).map((p) => Math.abs(Number(p.forecast - p.actual) / Number(p.actual)));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

