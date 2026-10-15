/**
 * FFSC-style financial ratios and the Acreflow health score (Roadmap 2, Phase 12).
 * Gross revenue is accrual: revenue + inventory and livestock value changes + gains.
 */
import { incomeStatement, balanceSheetAt, type BalanceSheet, type BalanceSheetInputs, type IncomeStatement, type Period } from "./statements.js";

export type RatioInputs = {
  is: IncomeStatement;
  start: BalanceSheet;            // balance sheet at the period's opening month-end
  end: BalanceSheet;
  days: number;                   // calendar days in the period
  annualizeWorkingCapital: boolean; // YTD only: WC / gross revenue uses annualized revenue
  ownerLaborCents: bigint;        // owner labor & management charge for the period
  withdrawalsCents: bigint;       // owner distributions + owner income-tax payments
  contributionsCents: bigint;
  termInterestPaidCents: bigint;
  termPrincipalPaidCents: bigint;
  scheduledTermPaymentsCents: bigint;
};

export type Ratios = {
  grossRevenueCents: bigint; currentRatio: number | null; workingCapitalCents: bigint; workingCapitalToGrossRevenue: number | null;
  debtToAsset: number | null; equityToAsset: number | null; debtToEquity: number | null; debtToAssetMarket: number | null;
  returnOnAssetsCost: number | null; returnOnAssetsMarket: number | null; returnOnEquity: number | null; operatingProfitMargin: number | null;
  assetTurnover: number | null; operatingExpenseRatio: number | null; depreciationExpenseRatio: number | null; interestExpenseRatio: number | null;
  netFarmIncomeRatio: number | null; capitalDebtRepaymentCapacityCents: bigint; repaymentMarginCents: bigint; termDebtCoverage: number | null;
  totalDebtCents: bigint; ownerLaborCents: bigint;
};

const div = (a: bigint, b: bigint) => (b === 0n ? null : Number(a) / Number(b));
const marketAssets = (b: BalanceSheet) => b.totalAssetsCents + b.landMarketCents - b.landCents;

export function financialRatios(x: RatioInputs): Ratios {
  const { is, start, end } = x;
  const gross = is.revenueCents + is.inventoryChangeCents + is.livestockChangeCents + is.gainCents;
  const wc = end.totalCurrentAssetsCents - end.totalCurrentLiabilitiesCents;
  const avgAssets = (end.totalAssetsCents + start.totalAssetsCents) / 2n;
  const avgMarket = (marketAssets(end) + marketAssets(start)) / 2n;
  const avgEquity = (end.totalEquityCents + start.totalEquityCents) / 2n;
  const returnCents = is.netFarmIncomeCents + is.interestCents - x.ownerLaborCents;
  const cdrc = is.netFarmIncomeCents + is.depreciationCents + x.termInterestPaidCents - x.withdrawalsCents;
  // Partial-year periods annualize revenue by days (365.25-day year).
  const annualGross = x.annualizeWorkingCapital ? (gross * 36525n) / (BigInt(x.days) * 100n) : gross;
  return {
    grossRevenueCents: gross,
    currentRatio: div(end.totalCurrentAssetsCents, end.totalCurrentLiabilitiesCents),
    workingCapitalCents: wc,
    workingCapitalToGrossRevenue: div(wc, annualGross),
    debtToAsset: div(end.totalLiabilitiesCents, end.totalAssetsCents),
    equityToAsset: div(end.totalEquityCents, end.totalAssetsCents),
    debtToEquity: div(end.totalLiabilitiesCents, end.totalEquityCents),
    debtToAssetMarket: div(end.totalLiabilitiesCents, marketAssets(end)),
    returnOnAssetsCost: div(returnCents, avgAssets),
    returnOnAssetsMarket: div(returnCents, avgMarket),
    returnOnEquity: div(is.netFarmIncomeCents - x.ownerLaborCents, avgEquity),
    operatingProfitMargin: div(returnCents, gross),
    assetTurnover: div(gross, avgAssets),
    operatingExpenseRatio: div(is.copCents + is.overheadCents, gross),
    depreciationExpenseRatio: div(is.depreciationCents, gross),
    interestExpenseRatio: div(is.interestCents, gross),
    netFarmIncomeRatio: div(is.netFarmIncomeCents, gross),
    capitalDebtRepaymentCapacityCents: cdrc,
    repaymentMarginCents: cdrc - x.scheduledTermPaymentsCents,
    termDebtCoverage: div(cdrc, x.scheduledTermPaymentsCents),
    // Interest-bearing debt: operating line + all term debt.
    totalDebtCents: end.operatingLineCents + end.currentPortionCents + end.landLoansCents + end.equipmentLoansCents + end.vehicleLoansCents + end.otherTermDebtCents,
    ownerLaborCents: x.ownerLaborCents,
  };
}

const t = (d: Date) => d.getTime();
const DAY = 86_400_000;

/** Gather ratio inputs for a period from the statement inputs. */
export function ratioInputsFor(inp: BalanceSheetInputs, p: Period, ownerLaborAnnualCents: bigint): RatioInputs {
  const days = Math.round((t(p.to) - t(p.from)) / DAY);
  let withdrawals = 0n, contributions = 0n, termInterest = 0n, principal = 0n;
  for (const r of inp.rows) {
    const inTxn = t(r.date) > t(p.from) && t(r.date) <= t(p.to);
    const inCash = r.cashDate != null && t(r.cashDate) > t(p.from) && t(r.cashDate) <= t(p.to);
    if ((r.accountCode === "8041" || r.accountCode === "8042") && inTxn) withdrawals -= r.amountCents;
    if (r.accountCode === "8040" && inCash) contributions += r.cashEffectCents ?? 0n;
    if (r.accountCode === "7020" && inCash) termInterest -= r.cashEffectCents ?? 0n;
    if (r.accountCode === "8011" && inCash) principal -= r.cashEffectCents ?? 0n;
  }
  let scheduled = 0n;
  for (const l of inp.loans) {
    if (l.isLine) continue;
    for (const s of l.schedule) if (t(s.dueDate) > t(p.from) && t(s.dueDate) <= t(p.to)) scheduled += s.paymentCents ?? 0n;
  }
  return {
    is: incomeStatement(inp.rows, p.from, p.to),
    start: balanceSheetAt(inp, p.from),
    end: balanceSheetAt(inp, p.to),
    days,
    annualizeWorkingCapital: p.kind === "ytd" || p.kind === "month" || p.kind === "quarter",
    ownerLaborCents: (ownerLaborAnnualCents * BigInt(days) * 2n + 365n) / 730n,
    withdrawalsCents: withdrawals, contributionsCents: contributions,
    termInterestPaidCents: termInterest, termPrincipalPaidCents: principal, scheduledTermPaymentsCents: scheduled,
  };
}

// ---------- health score ----------
export type HealthStatus = "Strong" | "Healthy" | "Watch" | "Weak";
export type HealthCategory = { key: "liquidity" | "solvency" | "profitability" | "repayment" | "efficiency"; label: string; score: number; status: HealthStatus; measures: { label: string; value: number | null; format: "ratio" | "pct" }[] };
export type HealthScore = { overall: number; status: HealthStatus; categories: HealthCategory[] };

/**
 * Score a ratio 0-100 against FFSC-style benchmarks: at or past `strong` = 100,
 * `weak` = 50, `floor` = 0, linear in between. `lowerIsBetter` flips the scale.
 */
export function benchmarkScore(v: number | null, weak: number, strong: number, floor: number, lowerIsBetter = false): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  const s = lowerIsBetter ? -v : v, w = lowerIsBetter ? -weak : weak, st = lowerIsBetter ? -strong : strong, f = lowerIsBetter ? -floor : floor;
  if (s >= st) return 100;
  if (s >= w) return 50 + (50 * (s - w)) / (st - w);
  if (s <= f) return 0;
  return (50 * (s - f)) / (w - f);
}
export const statusFor = (score: number): HealthStatus => (score >= 80 ? "Strong" : score >= 60 ? "Healthy" : score >= 40 ? "Watch" : "Weak");
const avg = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

export function healthScore(r: Ratios, hasTermDebt: boolean): HealthScore {
  const cats: Omit<HealthCategory, "status">[] = [
    { key: "liquidity", label: "Liquidity", score: avg([benchmarkScore(r.currentRatio, 1.3, 2.0, 0.8), benchmarkScore(r.workingCapitalToGrossRevenue, 0.1, 0.3, -0.1)]) ?? 50,
      measures: [{ label: "Current Ratio", value: r.currentRatio, format: "ratio" }, { label: "Working Capital / Revenue", value: r.workingCapitalToGrossRevenue, format: "pct" }] },
    { key: "solvency", label: "Solvency", score: avg([benchmarkScore(r.debtToAsset, 0.6, 0.3, 0.9, true)]) ?? 50,
      measures: [{ label: "Debt to Assets", value: r.debtToAsset, format: "pct" }, { label: "Debt to Equity", value: r.debtToEquity, format: "ratio" }] },
    { key: "profitability", label: "Profitability", score: avg([benchmarkScore(r.returnOnAssetsCost, 0.01, 0.05, -0.05), benchmarkScore(r.operatingProfitMargin, 0.1, 0.25, -0.15)]) ?? 50,
      measures: [{ label: "Return on Assets", value: r.returnOnAssetsCost, format: "pct" }, { label: "Operating Margin", value: r.operatingProfitMargin, format: "pct" }] },
    { key: "repayment", label: "Repayment Capacity", score: hasTermDebt ? benchmarkScore(r.termDebtCoverage, 1.1, 1.5, 0) ?? 50 : 100,
      measures: [{ label: "Term Debt Coverage", value: hasTermDebt ? r.termDebtCoverage : null, format: "ratio" }] },
    { key: "efficiency", label: "Efficiency", score: avg([benchmarkScore(r.operatingExpenseRatio, 0.8, 0.65, 1.0, true), benchmarkScore(r.assetTurnover, 0.2, 0.45, 0.05)]) ?? 50,
      measures: [{ label: "Operating Expense Ratio", value: r.operatingExpenseRatio, format: "pct" }, { label: "Asset Turnover", value: r.assetTurnover, format: "pct" }] },
  ];
  const categories = cats.map((c) => ({ ...c, score: Math.round(c.score), status: statusFor(c.score) }));
  const overall = Math.round(categories.reduce((s, c) => s + c.score, 0) / categories.length);
  return { overall, status: statusFor(overall), categories };
}
