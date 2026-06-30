import { prisma } from "@fl/db";
import { profitAndLoss, scheduleFSummary, cashFlowStatement, enterpriseProfitability, type ReportTxn } from "@fl/core";

export async function getReports(farmId: string, year: number) {
  const [txns, period] = await Promise.all([
    prisma.transaction.findMany({ where: { farmId }, include: { account: true } }),
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
