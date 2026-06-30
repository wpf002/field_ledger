import { prisma } from "@fl/db";
import { budgetStatus, type BudgetStatus } from "@fl/core";

export type BudgetWithStatus = { id: string; period: string; status: BudgetStatus };

/** Live budget-vs-actual status for every budget (YTD spend; monthly prorated). */
export async function getBudgetStatuses(farmId: string, today = new Date()): Promise<BudgetWithStatus[]> {
  const [budgets, txns, accounts] = await Promise.all([
    prisma.budget.findMany({ where: { farmId } }),
    prisma.transaction.findMany({ where: { farmId }, include: { account: true } }),
    prisma.account.findMany({ where: { farmId } }),
  ]);
  const labelByCode = new Map(accounts.map((a) => [a.code, a.label]));
  const expenses = txns.map((t) => ({ accountCode: t.account.code, amountCents: t.amountCents, date: t.date }));
  return budgets.map((b) => ({
    id: b.id,
    period: b.period,
    status: budgetStatus({ id: b.id, period: b.period, year: b.year, month: b.month, accountCode: b.accountCode, amountCents: b.amountCents, label: labelByCode.get(b.accountCode) }, expenses, today),
  }));
}
