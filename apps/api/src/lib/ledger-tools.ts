/**
 * Ledger tools — the grounding layer for the AI assistant (Invariant 3). Each
 * function reads the real ledger and returns structured data with money as
 * integer-cent strings. Both the deterministic router and the Claude tool-call
 * path answer ONLY from these results — no figure is ever invented.
 */
import { prisma, pnlWhere } from "@fl/db";
import {
  forecastContext, generateInsights, generateBrief, loadEnterpriseInputs, runWhatIf, SCENARIO_KEYS,
} from "@fl/db";
import {
  balanceSheetAt, incomeStatement, enterpriseStatements, cropEconomics, headEconomics, financialRatios, ratioInputsFor,
  periodFor, healthScore, agingSummary, AGING_BUCKETS, type ScenarioKey,
} from "@fl/core";

import {
  sumCents, obligationsInWindow, valueInventoryItem, latestPriceCents, budgetStatus,
  scheduleFSummary, evaluateAlerts, mergeSettings, type ReportTxn, type AlertInputs,
} from "@fl/core";

async function valuedInventory(farmId: string) { // starter-model inventory items
  const [items, prices] = await Promise.all([
    prisma.inventoryItem.findMany({ where: { farmId } }),
    prisma.commodityPrice.findMany(),
  ]);
  const asOf = new Date();
  return items.map((it) => ({ item: it, valuation: valueInventoryItem(it, latestPriceCents(prices, it.marketSymbol), asOf) }));
}

/** Year-to-date results and the balance sheet at the reporting date (accrual). */
export async function financialSummary(farmId: string) {
  const ctx = await forecastContext(prisma, farmId);
  const ytd = periodFor("ytd", ctx.asOf);
  const is = incomeStatement(ctx.inputs.rows, ytd.from, ytd.to);
  const bs = balanceSheetAt(ctx.inputs, ctx.asOf);
  return {
    asOf: ctx.asOf.toISOString().slice(0, 10),
    incomeCents: is.revenueCents.toString(),
    expenseCents: (is.copCents + is.overheadCents + is.depreciationCents + is.interestCents).toString(),
    netProfitCents: is.netFarmIncomeCents.toString(),
    inventoryValueCents: (bs.cropInventoryCents + bs.feedCents + bs.growingCropsCents + bs.suppliesCents + bs.marketLivestockCents + bs.breedingLivestockCents).toString(),
    liabilitiesCents: bs.totalLiabilitiesCents.toString(),
    netWorthCents: bs.marketNetWorthCents.toString(),
  };
}

export async function recentTransactions(farmId: string, limit = 5) {
  const txns = await prisma.transaction.findMany({ where: { farmId }, orderBy: { date: "desc" }, take: limit, include: { account: true } });
  return txns.map((t) => ({ date: t.date.toISOString().slice(0, 10), description: t.description, amountCents: t.amountCents.toString(), category: t.account.label }));
}

export async function upcomingObligations(farmId: string, days = 90) {
  const [liabilities, leases] = await Promise.all([
    prisma.liability.findMany({ where: { farmId } }),
    prisma.lease.findMany({ where: { farmId } }),
  ]);
  const o = obligationsInWindow(
    liabilities.map((l) => ({ id: l.id, name: l.name, balanceCents: l.balanceCents, ratePct: Number(l.ratePct), paymentCents: l.paymentCents, nextPaymentAt: l.nextPaymentAt, paymentFreq: l.paymentFreq })),
    leases.map((l) => ({ id: l.id, name: l.name, type: l.type, annualRentCents: l.annualRentCents, termStart: l.termStart, termEnd: l.termEnd })),
    new Date(), days,
  );
  return { windowDays: days, loanPaymentsCents: o.loanPaymentsCents.toString(), leasePaymentsCents: o.leasePaymentsCents.toString(), totalCents: o.totalCents.toString(), items: [...o.loanItems.map((i) => ({ name: i.name, amountCents: i.paymentCents.toString(), due: i.dueDate.toISOString().slice(0, 10) })), ...o.leaseItems.map((i) => ({ name: i.name, amountCents: i.amountCents.toString(), due: "prorated" }))] };
}

export async function marketableInventory(farmId: string) {
  const valued = await valuedInventory(farmId);
  const marketable = valued.filter((v) => v.valuation.marketable);
  return {
    totalCents: sumCents(marketable.map((v) => v.valuation.valueCents)).toString(),
    items: marketable.map((v) => ({ name: v.item.name, quantity: Number(v.item.quantity), unit: v.item.unit, unitPriceCents: (v.valuation.unitPriceCents ?? 0n).toString(), valueCents: v.valuation.valueCents.toString() })),
  };
}

export async function budgetStatuses(farmId: string) {
  const [budgets, txns, accounts] = await Promise.all([
    prisma.budget.findMany({ where: { farmId } }),
    prisma.transaction.findMany({ where: { farmId, ...pnlWhere }, include: { account: true } }),
    prisma.account.findMany({ where: { farmId } }),
  ]);
  const labelByCode = new Map(accounts.map((a) => [a.code, a.label]));
  const expenses = txns.map((t) => ({ accountCode: t.account.code, amountCents: t.amountCents, date: t.date }));
  const now = new Date();
  return budgets.map((b) => {
    const s = budgetStatus({ id: b.id, period: b.period, year: b.year, month: b.month, accountCode: b.accountCode, amountCents: b.amountCents, label: labelByCode.get(b.accountCode) }, expenses, now);
    return { label: s.label, period: s.period, budgetCents: s.amountCents.toString(), targetCents: s.targetCents.toString(), spentCents: s.actualCents.toString(), pct: s.pct, over: s.over };
  });
}

export async function scheduleFReport(farmId: string, year = new Date().getUTCFullYear()) {
  const txns = await prisma.transaction.findMany({ where: { farmId, ...pnlWhere }, include: { account: true } });
  const rt: ReportTxn[] = txns.map((t) => ({ amountCents: t.amountCents, date: t.date, account: { code: t.account.code, label: t.account.label, kind: t.account.kind, scheduleFCode: t.account.scheduleFCode } }));
  const sf = scheduleFSummary(rt, year);
  return { year, grossIncomeCents: sf.totalIncomeCents.toString(), totalExpenseCents: sf.totalExpenseCents.toString(), netFarmProfitCents: sf.netFarmProfitCents.toString(), incomeLines: sf.income.map((l) => ({ line: l.line, label: l.label, amountCents: l.totalCents.toString() })), expenseLines: sf.expenses.map((l) => ({ line: l.line, label: l.label, amountCents: l.totalCents.toString() })) };
}

export async function alertsList(farmId: string) {
  const [liabilities, leases, invoices, settings, budgets] = await Promise.all([
    prisma.liability.findMany({ where: { farmId } }),
    prisma.lease.findMany({ where: { farmId } }),
    prisma.invoice.findMany({ where: { farmId }, include: { customer: true } }),
    prisma.alertSetting.findMany({ where: { farmId } }),
    budgetStatuses(farmId),
  ]);
  const input: AlertInputs = {
    liabilities: liabilities.map((l) => ({ id: l.id, name: l.name, nextPaymentAt: l.nextPaymentAt, paymentCents: l.paymentCents })),
    leases: leases.map((l) => ({ id: l.id, name: l.name, type: l.type, termEnd: l.termEnd, nextPaymentAt: l.nextPaymentAt, annualRentCents: l.annualRentCents })),
    invoices: invoices.map((i) => ({ id: i.id, number: i.number, status: i.status, dueAt: i.dueAt, totalCents: i.totalCents, customerName: i.customer.name })),
    budgetActuals: budgets.map((b, i) => ({ id: String(i), label: b.label, budgetCents: BigInt(b.targetCents), actualCents: BigInt(b.spentCents) })),
  };
  const alerts = evaluateAlerts(input, new Date(), mergeSettings(settings));
  return alerts.map((a) => ({ severity: a.severity, title: a.title, message: a.message }));
}

/** Tool registry: name -> handler. Shared by the deterministic and Claude paths. */
export const LEDGER_TOOLS: Record<string, (farmId: string, input?: Record<string, unknown>) => Promise<unknown>> = {
  financial_summary: (f) => financialSummary(f),
  recent_transactions: (f, i) => recentTransactions(f, Number(i?.limit ?? 5)),
  upcoming_obligations: (f, i) => upcomingObligations(f, Number(i?.days ?? 90)),
  marketable_inventory: (f) => marketableInventory(f),
  budget_status: (f) => budgetStatuses(f),
  schedule_f: (f, i) => scheduleFReport(f, Number(i?.year ?? new Date().getUTCFullYear())),
  alerts: (f) => alertsList(f),
};

// ---------- Roadmap 2 (Phase 16): tools over the full financial model ----------
const c = (v: bigint) => v.toString();
const yearPeriod = (year: number, asOf: Date) => ({ from: new Date(Date.UTC(year - 1, 11, 31)), to: year >= asOf.getUTCFullYear() ? asOf : new Date(Date.UTC(year, 11, 31)) });

export async function cashPosition(farmId: string) {
  const ctx = await forecastContext(prisma, farmId);
  const bs = balanceSheetAt(ctx.inputs, ctx.asOf);
  return {
    asOf: ctx.asOf.toISOString().slice(0, 10), cashCents: c(bs.cashCents), operatingLineCents: c(bs.operatingLineCents),
    lineLimitCents: ctx.lineTerms ? c(ctx.lineTerms.limitCents) : null, lineAvailableCents: ctx.lineTerms ? c(ctx.lineTerms.limitCents - bs.operatingLineCents) : null,
    workingCapitalCents: c(bs.totalCurrentAssetsCents - bs.totalCurrentLiabilitiesCents), receivablesCents: c(bs.arCents), payablesCents: c(bs.apCents + bs.creditCardsCents),
  };
}

export async function cashForecast(farmId: string, input?: Record<string, unknown>) {
  const ctx = await forecastContext(prisma, farmId);
  const k = (SCENARIO_KEYS.find((s) => s === input?.scenario) ?? "base") as ScenarioKey;
  const w = ctx.thirteen(k), m = ctx.twelve(k);
  return {
    asOf: ctx.asOf.toISOString().slice(0, 10), scenario: k, reserveCents: c(ctx.reserveCents),
    thirteenWeek: { endingCashCents: c(w.weeks[w.weeks.length - 1]!.endingCashCents), minimum: { week: w.minimum.week, cents: c(w.minimum.cents) }, reserveBreachWeekStart: w.reserveBreach?.start.toISOString().slice(0, 10) ?? null },
    months: m.map((x) => ({ monthEnd: x.monthEnd.toISOString().slice(0, 10), revenueCents: c(x.pnl.revenueCents), netIncomeCents: c(x.pnl.netIncomeOperatingCents), endingCashCents: c(x.cash.endingCashCents), lineBalanceCents: c(x.cash.lineBalanceCents) })),
  };
}

export async function enterpriseProfitability(farmId: string, input?: Record<string, unknown>) {
  const ctx = await forecastContext(prisma, farmId);
  const year = Number(input?.year ?? ctx.asOf.getUTCFullYear());
  const p = yearPeriod(year, ctx.asOf);
  const names = new Map((await prisma.enterprise.findMany({ where: { farmId } })).map((e) => [e.id, e.name]));
  return { year, through: p.to.toISOString().slice(0, 10), enterprises: [...enterpriseStatements(ctx.inputs.rows, p.from, p.to).entries()].map(([id, s]) => ({
    enterprise: id ? names.get(id) : "Unassigned", revenueCents: c(s.revenueCents), transfersCents: c(s.transfersCents), directCostsCents: c(s.copCents),
    grossProfitCents: c(s.grossProfitCents), overheadCents: c(s.overheadCents), depreciationCents: c(s.depreciationCents), netIncomeCents: c(s.netIncomeOperatingCents), netFarmIncomeCents: c(s.netFarmIncomeCents),
  })) };
}

export async function cropProfitability(farmId: string, input?: Record<string, unknown>) {
  const ctx = await forecastContext(prisma, farmId);
  const ei = await loadEnterpriseInputs(prisma, farmId, ctx.inputs.cutoff);
  const year = Number(input?.year ?? ctx.asOf.getUTCFullYear() - 1);
  return { year, crops: cropEconomics(ctx.inputs.rows, ei.cropSeasons, ei.depreciationByEnterpriseYear).filter((x) => x.season.year === year).map((x) => ({
    crop: x.season.crop, acres: x.season.acres, yield: x.season.actualYield, yieldUnit: x.season.yieldUnit, price: x.season.actualAvgPrice,
    revenuePerAcre: x.perAcre.revenue, costPerAcre: x.perAcre.total, profitPerAcre: x.perAcre.profit, breakEvenYield: x.breakEvenYield, breakEvenPrice: x.breakEvenPrice,
  })) };
}

export async function livestockProfitability(farmId: string, input?: Record<string, unknown>) {
  const ctx = await forecastContext(prisma, farmId);
  const ei = await loadEnterpriseInputs(prisma, farmId, ctx.inputs.cutoff);
  const year = Number(input?.year ?? ctx.asOf.getUTCFullYear() - 1);
  const p = yearPeriod(year, ctx.asOf);
  const names = new Map(ei.enterprises.map((e) => [e.id, e.name]));
  return { year, enterprises: ei.unitCounts.filter((u) => u.year === year).map((u) => { const h = headEconomics(ctx.inputs.rows, u.enterpriseId, p.from, p.to, u.count, u.basis); return {
    enterprise: names.get(u.enterpriseId), basis: u.basis, units: u.count, revenuePerUnit: h.perHead.revenue, costPerUnit: h.perHead.total, feedPerUnit: h.perHead.feed,
    profitPerUnit: h.perHead.profitBeforeInventory, profitPerUnitAccrual: h.perHead.profitAccrual,
  }; }) };
}

export async function debtSummary(farmId: string) {
  const ctx = await forecastContext(prisma, farmId);
  const bs = balanceSheetAt(ctx.inputs, ctx.asOf);
  const r = financialRatios(ratioInputsFor(ctx.inputs, periodFor("ttm", ctx.asOf), ctx.inputs.ownerLaborAnnualCents));
  const loans = await prisma.liability.findMany({ where: { farmId } });
  return {
    asOf: ctx.asOf.toISOString().slice(0, 10), interestBearingDebtCents: c(r.totalDebtCents), currentPortionCents: c(bs.currentPortionCents), operatingLineCents: c(bs.operatingLineCents),
    debtToAsset: r.debtToAsset, debtToEquity: r.debtToEquity, termDebtCoverage: r.termDebtCoverage, repaymentMarginCents: c(r.repaymentMarginCents),
    loans: loans.map((l) => ({ name: l.name, lender: l.lender, type: l.debtType ?? l.type, balanceCents: c(l.balanceCents), ratePct: Number(l.ratePct), paymentCents: l.paymentCents ? c(l.paymentCents) : null, frequency: l.paymentFreq, maturity: l.maturityAt?.toISOString().slice(0, 10) ?? null })),
  };
}

export async function inventoryPosition(farmId: string) {
  const ctx = await forecastContext(prisma, farmId);
  const snaps = await prisma.inventorySnapshot.findMany({ where: { farmId, asOf: ctx.asOf } });
  return { asOf: ctx.asOf.toISOString().slice(0, 10), items: snaps.map((s) => ({ item: s.item, category: s.category, quantity: Number(s.quantity), unit: s.unit, costBasisCents: c(s.costBasisCents), marketValueCents: c(s.marketValueCents), carriedAt: s.bsValuation, expectedUseOrSale: s.expectedUseOrSale })) };
}

export async function accountsReceivable(farmId: string) {
  const ctx = await forecastContext(prisma, farmId);
  const open = await prisma.invoice.findMany({ where: { farmId, status: { not: "PAID" } }, include: { customer: true }, orderBy: { dueAt: "asc" } });
  const aging = agingSummary(open.map((i) => ({ dueDate: i.dueAt, balanceCents: i.totalCents - i.amountPaidCents })), ctx.asOf);
  return {
    asOf: ctx.asOf.toISOString().slice(0, 10), aging: Object.fromEntries(AGING_BUCKETS.map((b) => [b, c(aging[b])])),
    invoices: open.map((i) => ({ number: i.number, customer: i.customer.name, balanceCents: c(i.totalCents - i.amountPaidCents), due: i.dueAt.toISOString().slice(0, 10), description: i.description })),
  };
}

export async function financialHealth(farmId: string) {
  const ctx = await forecastContext(prisma, farmId);
  const r = financialRatios(ratioInputsFor(ctx.inputs, periodFor("ttm", ctx.asOf), ctx.inputs.ownerLaborAnnualCents));
  const h = healthScore(r, ctx.inputs.loans.some((l) => !l.isLine && l.schedule.length > 0));
  const is = incomeStatement(ctx.inputs.rows, periodFor("ytd", ctx.asOf).from, ctx.asOf);
  return { asOf: ctx.asOf.toISOString().slice(0, 10), overall: h.overall, status: h.status, categories: h.categories.map((x) => ({ category: x.label, score: x.score, status: x.status, measures: x.measures })), ytdRevenueCents: c(is.revenueCents), ytdNetFarmIncomeCents: c(is.netFarmIncomeCents) };
}

export async function insightsList(farmId: string) {
  return (await generateInsights(prisma, farmId)).map((i) => ({ severity: i.severity, title: i.title, finding: i.finding, recommendation: i.recommendation, sources: i.sources }));
}

export async function financialBrief(farmId: string, input?: Record<string, unknown>) {
  const b = await generateBrief(prisma, farmId, input?.kind === "monthly" ? "monthly" : "weekly");
  return { asOf: b.asOf.toISOString().slice(0, 10), score: b.score, status: b.status, lines: b.lines.map((l) => l.text), actions: b.actions.map((a) => a.text) };
}

/** What-if: recompute 12-month profit, cash, debt, and health under changed prices, costs, or a purchase. Read-only. */
export async function runScenario(farmId: string, input?: Record<string, unknown>) {
  const ctx = await forecastContext(prisma, farmId);
  const n = (k: string) => Number(input?.[k] ?? 0) || 0;
  const w = {
    pricePct: n("pricePct") / 100, volumePct: n("volumePct") / 100, costPct: n("costPct") / 100,
    equipment: n("equipmentPrice") > 0 ? { price: n("equipmentPrice"), down: n("downPayment"), ratePct: n("ratePct") || 7.5, years: n("years") || 5, life: 10, salvage: 0 } : undefined,
    hireAnnualWage: n("hireAnnualWage"),
  };
  const fmt = (o: ReturnType<typeof runWhatIf>) => ({ profitCents: c(o.profitCents), endingCashCents: c(o.endingCashCents), minCashCents: c(o.minCashCents), peakLineCents: c(o.peakLineCents), debtCents: c(o.debtCents), workingCapitalCents: c(o.workingCapitalCents), currentRatio: o.currentRatio, debtToAsset: o.debtToAsset, termDebtCoverage: o.coverage, healthScore: o.health });
  return { horizon: "next 12 months", before: fmt(runWhatIf(ctx, { pricePct: 0, volumePct: 0, costPct: 0 })), after: fmt(runWhatIf(ctx, w)), assumptions: input ?? {} };
}

/**
 * Tool permission tiers (spec "Security model for AI"): read = summaries and records,
 * analyze = forecasts and scenarios. Viewers get read only. Write and high-risk
 * actions (payments, transfers, account changes) are not exposed to the model.
 */
export type ToolTier = "read" | "analyze";
export const TOOL_TIER: Record<string, ToolTier> = {
  financial_summary: "read", recent_transactions: "read", upcoming_obligations: "read", marketable_inventory: "read", budget_status: "read",
  schedule_f: "read", alerts: "read", cash_position: "read", enterprise_profitability: "read", crop_profitability: "read",
  livestock_profitability: "read", debt_summary: "read", inventory_position: "read", accounts_receivable: "read", financial_health: "read",
  insights: "analyze", financial_brief: "analyze", cash_forecast: "analyze", run_scenario: "analyze",
};
Object.assign(LEDGER_TOOLS, {
  cash_position: (f: string) => cashPosition(f),
  cash_forecast: (f: string, i?: Record<string, unknown>) => cashForecast(f, i),
  enterprise_profitability: (f: string, i?: Record<string, unknown>) => enterpriseProfitability(f, i),
  crop_profitability: (f: string, i?: Record<string, unknown>) => cropProfitability(f, i),
  livestock_profitability: (f: string, i?: Record<string, unknown>) => livestockProfitability(f, i),
  debt_summary: (f: string) => debtSummary(f),
  inventory_position: (f: string) => inventoryPosition(f),
  accounts_receivable: (f: string) => accountsReceivable(f),
  financial_health: (f: string) => financialHealth(f),
  insights: (f: string) => insightsList(f),
  financial_brief: (f: string, i?: Record<string, unknown>) => financialBrief(f, i),
  run_scenario: (f: string, i?: Record<string, unknown>) => runScenario(f, i),
});
