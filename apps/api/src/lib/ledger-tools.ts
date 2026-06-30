/**
 * Ledger tools — the grounding layer for the AI assistant (Invariant 3). Each
 * function reads the real ledger and returns structured data with money as
 * integer-cent strings. Both the deterministic router and the Claude tool-call
 * path answer ONLY from these results — no figure is ever invented.
 */
import { prisma } from "@fl/db";
import {
  sumCents, obligationsInWindow, valueInventoryItem, latestPriceCents, budgetStatus,
  scheduleFSummary, evaluateAlerts, mergeSettings, type ReportTxn, type AlertInputs,
} from "@fl/core";

async function valuedInventory(farmId: string) {
  const [items, prices] = await Promise.all([
    prisma.inventoryItem.findMany({ where: { farmId } }),
    prisma.commodityPrice.findMany(),
  ]);
  const asOf = new Date();
  return items.map((it) => ({ item: it, valuation: valueInventoryItem(it, latestPriceCents(prices, it.marketSymbol), asOf) }));
}

export async function financialSummary(farmId: string) {
  const [txns, valued, liabilities] = await Promise.all([
    prisma.transaction.findMany({ where: { farmId } }),
    valuedInventory(farmId),
    prisma.liability.findMany({ where: { farmId } }),
  ]);
  const incomeCents = sumCents(txns.filter((t) => t.amountCents > 0n).map((t) => t.amountCents));
  const expenseCents = sumCents(txns.filter((t) => t.amountCents < 0n).map((t) => -t.amountCents));
  const inventoryValueCents = sumCents(valued.map((v) => v.valuation.valueCents));
  const liabilitiesCents = sumCents(liabilities.map((l) => l.balanceCents));
  return {
    incomeCents: incomeCents.toString(),
    expenseCents: expenseCents.toString(),
    netProfitCents: (incomeCents - expenseCents).toString(),
    inventoryValueCents: inventoryValueCents.toString(),
    liabilitiesCents: liabilitiesCents.toString(),
    netWorthCents: (inventoryValueCents - liabilitiesCents).toString(),
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
    prisma.transaction.findMany({ where: { farmId }, include: { account: true } }),
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
  const txns = await prisma.transaction.findMany({ where: { farmId }, include: { account: true } });
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
