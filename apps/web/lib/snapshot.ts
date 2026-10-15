import { cache } from "react";
import { prisma } from "@fl/db";
import {
  balanceSheetAt, incomeStatement, periodFor, financialRatios, ratioInputsFor, healthScore, cashFlowReport, sumCents,
  type StatementRow,
} from "@fl/core";
import { getStatementContext } from "./statements";

const DAY = 86_400_000;

/** Everything the dashboard and Health page show, as of the farm's reporting date. */
export const getFinancialSnapshot = cache(async (farmId: string) => {
  const { inputs, asOf } = await getStatementContext(farmId);
  const bs = balanceSheetAt(inputs, asOf);
  const ytd = periodFor("ytd", asOf), month = periodFor("month", asOf), ttm = periodFor("ttm", asOf);
  const isYtd = incomeStatement(inputs.rows, ytd.from, ytd.to);
  const isMonth = incomeStatement(inputs.rows, month.from, month.to);
  const ratios = financialRatios(ratioInputsFor(inputs, ttm, inputs.ownerLaborAnnualCents));
  const termLoans = inputs.loans.filter((l) => !l.isLine);
  const health = healthScore(ratios, termLoans.some((l) => l.schedule.length > 0));

  const [liabilities, bills] = await Promise.all([
    prisma.liability.findMany({ where: { farmId } }),
    prisma.bill.findMany({ where: { farmId, status: { not: "Paid" } }, select: { amountCents: true, amountPaidCents: true, dueDate: true } }),
  ]);
  const lineLimit = sumCents(liabilities.filter((l) => l.type === "OPERATING_LINE").map((l) => l.limitCents ?? l.originalCents));
  const lineAvailable = lineLimit > bs.operatingLineCents ? lineLimit - bs.operatingLineCents : 0n;

  // Debt service: scheduled term payments due in the next 12 months.
  const t = asOf.getTime();
  const due = (days: number) => sumCents(termLoans.flatMap((l) => l.schedule.filter((s) => s.dueDate.getTime() > t && s.dueDate.getTime() <= t + days * DAY).map((s) => s.paymentCents ?? 0n)));
  const annualDebtServiceCents = due(365);
  // Cash obligations in the next 90 days: open bills + scheduled loan payments + accrued taxes.
  const obligations90Cents = sumCents(bills.filter((b) => b.dueDate.getTime() <= t + 90 * DAY).map((b) => b.amountCents - b.amountPaidCents))
    + due(90) + bs.accruedPropertyTaxCents + bs.accruedPayrollTaxCents + bs.creditCardsCents;

  return {
    asOf, bs, isYtd, isMonth, ratios, health, ytd, month, ttm,
    lineLimitCents: lineLimit, lineAvailableCents: lineAvailable, annualDebtServiceCents, obligations90Cents,
    inventoryValueCents: bs.cropInventoryCents + bs.feedCents + bs.growingCropsCents + bs.suppliesCents + bs.marketLivestockCents + bs.breedingLivestockCents,
    interestBearingDebtCents: ratios.totalDebtCents,
    rows: inputs.rows,
    opening: inputs.opening,
  };
});

/** Monthly operating cash in and out for the 12 months ending at `asOf` (whole dollars for charts). */
export function cashTrend(rows: StatementRow[], opening: Parameters<typeof cashFlowReport>[1], asOf: Date) {
  const out: { month: string; income: number; expenses: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const to = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - i + 1, 0));
    const from = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 0));
    if (to.getTime() <= opening.asOf.getTime()) continue;
    const ops = cashFlowReport(rows, opening, from, to).sections.find((s) => s.section === "Operating")!;
    const inflow = ops.lines.filter((l) => l.cents > 0n).reduce((s, l) => s + l.cents, 0n);
    const outflow = ops.lines.filter((l) => l.cents < 0n).reduce((s, l) => s - l.cents, 0n);
    out.push({ month: to.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }), income: Number(inflow) / 100, expenses: Number(outflow) / 100 });
  }
  return out;
}
