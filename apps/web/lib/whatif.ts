import {
  balanceSheetAt, twelveMonthForecast, financialRatios, healthScore, loanPayment, loanBalance, currentPortion, netBookValue, fromSections, sumCents,
  type BalanceSheet, type Drivers, type LoanRec, type AssetRec, type CashItem, type IncomeStatement,
} from "@fl/core";
import type { getForecastContext } from "./forecast";

export type WhatIf = {
  pricePct: number; volumePct: number; costPct: number;
  equipment?: { price: number; down: number; ratePct: number; years: number; life: number; salvage: number };
  hireAnnualWage?: number;
  lease?: { acres: number; rentPerAcre: number; marginPerAcre: number };
};
export type Outcome = {
  profitCents: bigint; endingCashCents: bigint; minCashCents: bigint; peakLineCents: bigint; debtCents: bigint; workingCapitalCents: bigint;
  currentRatio: number | null; debtToAsset: number | null; coverage: number | null; health: number;
};

type Ctx = Awaited<ReturnType<typeof getForecastContext>>;
const DAY = 86_400_000;
const c = (dollars: number) => BigInt(Math.round(dollars * 100));

/** Run the 12-month forecast with a what-if and roll the balance sheet forward to its end. */
export function runWhatIf(ctx: Ctx, w: WhatIf): Outcome {
  const asOf = ctx.asOf;
  const drivers: Drivers = { pricePct: ctx.drivers.base.pricePct + w.pricePct, volumePct: ctx.drivers.base.volumePct + w.volumePct, costInflationPct: ctx.drivers.base.costInflationPct + w.costPct };
  const items: CashItem[] = [];
  const loans: LoanRec[] = [...ctx.inputs.loans];
  const assets: AssetRec[] = [...ctx.inputs.assets];
  let monthlyCost = 0n, monthlyRevenue = 0n;
  const buyDate = new Date(asOf.getTime() + 15 * DAY);
  if (w.equipment && w.equipment.price > 0) {
    const e = w.equipment;
    items.push({ date: buyDate, group: "Equipment & capital purchases", source: "operating plan", description: "What-if purchase (down payment)", cents: -c(e.down) });
    const financed = c(e.price - e.down);
    if (financed > 0n) {
      const pay = loanPayment(financed, e.ratePct, e.years);
      let bal = financed;
      const schedule = Array.from({ length: e.years }, (_, i) => {
        const interest = BigInt(Math.round(Number(bal) * e.ratePct / 100));
        const principal = i === e.years - 1 ? bal : pay - interest;
        bal -= principal;
        return { dueDate: new Date(Date.UTC(buyDate.getUTCFullYear() + i + 1, buyDate.getUTCMonth(), buyDate.getUTCDate())), paymentCents: principal + interest, principalCents: principal, endingBalanceCents: bal };
      });
      loans.push({ id: "whatif", debtType: "Equipment loan", isLine: false, originatedAt: buyDate, originalCents: financed, schedule });
    }
    assets.push({ category: "Machinery & equipment", purchasedAt: buyDate, originalCostCents: c(e.price), salvageCents: c(e.salvage), usefulLifeYears: e.life, disposedAt: null });
  }
  if (w.hireAnnualWage && w.hireAnnualWage > 0) {
    const m = c(w.hireAnnualWage * 1.0765 / 12); // wages + employer payroll tax
    monthlyCost += m;
    for (let i = 1; i <= 12; i++) items.push({ date: new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() + i, 15)), group: "Payroll", source: "operating plan", description: "What-if hire", cents: -m });
  }
  if (w.lease && w.lease.acres > 0) {
    // Leased acres: rent paid up front; added margin earned evenly through the year.
    const rent = c(w.lease.acres * w.lease.rentPerAcre), margin = c(w.lease.acres * w.lease.marginPerAcre);
    items.push({ date: buyDate, group: "Other operating payments", source: "operating plan", description: "What-if lease rent", cents: -rent });
    for (let i = 1; i <= 12; i++) items.push({ date: new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() + i, 20)), group: "Customer collections", source: "operating plan", description: "What-if lease margin", cents: margin / 12n });
    monthlyCost += rent / 12n; monthlyRevenue += margin / 12n;
  }
  const bs0 = balanceSheetAt(ctx.inputs, asOf);
  const fc = twelveMonthForecast({
    rows: ctx.inputs.rows, asOf, cashCents: bs0.cashCents, loans, assets, line: ctx.lineTerms, reserveCents: ctx.reserveCents, drivers,
    extra: { items, monthlyCostCents: monthlyCost, monthlyRevenueCents: monthlyRevenue },
  });
  const end = fc[fc.length - 1]!.monthEnd;
  const is: IncomeStatement = fromSections({
    REV: sumCents(fc.map((m) => m.pnl.revenueCents)), XFER: 0n, COP: -sumCents(fc.map((m) => m.pnl.copCents)), OVH: -sumCents(fc.map((m) => m.pnl.overheadCents)),
    DEP: -sumCents(fc.map((m) => m.pnl.depreciationCents)), INT: -sumCents(fc.map((m) => m.pnl.interestCents)),
  });
  // Roll the balance sheet: cash and line from the forecast, debt from schedules, assets at book.
  const bs1: BalanceSheet = { ...bs0, asOf: end };
  bs1.cashCents = fc[fc.length - 1]!.cash.endingCashCents;
  bs1.operatingLineCents = fc[fc.length - 1]!.cash.lineBalanceCents;
  bs1.currentPortionCents = sumCents(loans.filter((l) => !l.isLine).map((l) => currentPortion(l, end)));
  const termDebt = sumCents(loans.filter((l) => !l.isLine).map((l) => loanBalance(l, end)));
  bs1.landLoansCents = termDebt - bs1.currentPortionCents; bs1.equipmentLoansCents = 0n; bs1.vehicleLoansCents = 0n; bs1.otherTermDebtCents = 0n;
  bs1.machineryCents = sumCents(assets.filter((a) => a.category !== "Land" && a.category !== "Vehicles" && a.category !== "Buildings & improvements").map((a) => netBookValue(a, end)));
  bs1.totalCurrentAssetsCents = bs1.cashCents + bs1.arCents + bs1.prepaidCents + bs1.cropInventoryCents + bs1.feedCents + bs1.growingCropsCents + bs1.suppliesCents + bs1.marketLivestockCents;
  bs1.totalNonCurrentAssetsCents = bs1.breedingLivestockCents + bs1.machineryCents + bs1.vehiclesCents + bs1.buildingsCents + bs1.landCents;
  bs1.totalAssetsCents = bs1.totalCurrentAssetsCents + bs1.totalNonCurrentAssetsCents;
  bs1.totalCurrentLiabilitiesCents = bs1.apCents + bs1.creditCardsCents + bs1.accruedPropertyTaxCents + bs1.accruedPayrollTaxCents + bs1.customerDepositsCents + bs1.operatingLineCents + bs1.currentPortionCents;
  bs1.totalLiabilitiesCents = bs1.totalCurrentLiabilitiesCents + bs1.landLoansCents;
  bs1.totalEquityCents = bs1.totalAssetsCents - bs1.totalLiabilitiesCents;
  const scheduled = sumCents(loans.filter((l) => !l.isLine).flatMap((l) => l.schedule.filter((s) => s.dueDate > asOf && s.dueDate <= end).map((s) => s.paymentCents ?? s.principalCents)));
  const r = financialRatios({
    is, start: bs0, end: bs1, days: 365, annualizeWorkingCapital: false, ownerLaborCents: ctx.inputs.ownerLaborAnnualCents,
    withdrawalsCents: -sumCents(fc.map((m) => m.cash.byGroup.get("Owner distributions") ?? 0n)), contributionsCents: 0n,
    termInterestPaidCents: is.interestCents, termPrincipalPaidCents: 0n, scheduledTermPaymentsCents: scheduled,
  });
  return {
    profitCents: is.netIncomeOperatingCents, endingCashCents: bs1.cashCents,
    minCashCents: fc.reduce((a, m) => (m.cash.endingCashCents < a ? m.cash.endingCashCents : a), fc[0]!.cash.endingCashCents),
    peakLineCents: fc.reduce((a, m) => (m.cash.lineBalanceCents > a ? m.cash.lineBalanceCents : a), 0n),
    debtCents: bs1.operatingLineCents + termDebt, workingCapitalCents: bs1.totalCurrentAssetsCents - bs1.totalCurrentLiabilitiesCents,
    currentRatio: r.currentRatio, debtToAsset: r.debtToAsset, coverage: r.termDebtCoverage, health: healthScore(r, scheduled > 0n).overall,
  };
}
