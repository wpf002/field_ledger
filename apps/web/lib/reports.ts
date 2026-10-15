import { prisma, pnlWhere } from "@fl/db";
import { profitAndLoss, scheduleFSummary, cashFlowStatement, enterpriseProfitability, type ReportTxn } from "@fl/core";

export async function getReports(farmId: string, year: number) {
  const [txns, period] = await Promise.all([
    prisma.transaction.findMany({ where: { farmId, ...pnlWhere }, include: { account: true } }),
    prisma.accountingPeriod.findUnique({ where: { farmId_year: { farmId, year } } }),
  ]);
  const rt: ReportTxn[] = txns.map((t) => ({ amountCents: t.amountCents, date: t.date, account: { code: t.account.code, label: t.account.label, kind: t.account.kind, scheduleFCode: t.account.scheduleFCode } }));
  return {
    pnl: profitAndLoss(rt, year),
    scheduleF: scheduleFSummary(rt, year),
    cashFlow: cashFlowStatement(rt, year),
    enterprises: enterpriseProfitability(rt, year),
    locked: period?.locked ?? false,
  };
}

/** Years with ledger activity, newest first (falls back to the current year). */
export async function getReportYears(farmId: string) {
  const [first, last] = await Promise.all([
    prisma.transaction.findFirst({ where: { farmId }, orderBy: { date: "asc" }, select: { date: true } }),
    prisma.transaction.findFirst({ where: { farmId, entryType: "ledger" }, orderBy: { date: "desc" }, select: { date: true } }),
  ]);
  const now = new Date().getUTCFullYear();
  const from = first?.date.getUTCFullYear() ?? now, to = Math.min(last?.date.getUTCFullYear() ?? now, now);
  const years: number[] = [];
  for (let y = to; y >= from; y--) years.push(y);
  return { years: years.length ? years : [now] };
}
