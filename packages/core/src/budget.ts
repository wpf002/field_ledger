/**
 * Phase 5 budget-vs-actual (pure, integer cents). Actuals come from the ledger;
 * monthly budgets are compared on a year-to-date run-rate (amount × months
 * elapsed) so a single source of truth drives the Budgets page, the Dashboard
 * Budget Health bars, and the budget_over alert rule.
 */
export type BudgetLike = { id: string; period: string; year: number; month: number | null; accountCode: string; amountCents: bigint; label?: string };
export type ExpenseLike = { accountCode: string; amountCents: bigint; date: Date };

/** Year-to-date actual spend for a budget's category (expenses are negative). */
export function budgetActualCents(b: BudgetLike, txns: ExpenseLike[]): bigint {
  let sum = 0n;
  for (const t of txns) {
    if (t.accountCode !== b.accountCode || t.amountCents >= 0n) continue;
    if (t.date.getUTCFullYear() !== b.year) continue;
    if (b.period === "MONTHLY" && b.month != null && t.date.getUTCMonth() + 1 !== b.month) continue;
    sum += -t.amountCents;
  }
  return sum;
}

export type BudgetStatus = {
  id: string;
  label: string;
  accountCode: string;
  period: string;
  amountCents: bigint;   // the budget figure (per-month for MONTHLY, per-year for ANNUAL)
  actualCents: bigint;   // YTD spend
  targetCents: bigint;   // amount prorated to the elapsed window
  pct: number;
  over: boolean;
};

/** Status for one budget at `today`. Monthly target prorates to months elapsed. */
export function budgetStatus(b: BudgetLike, txns: ExpenseLike[], today: Date): BudgetStatus {
  const actualCents = budgetActualCents(b, txns);
  let targetCents = b.amountCents;
  if (b.period === "MONTHLY") {
    const elapsed = b.month != null ? 1 : today.getUTCFullYear() === b.year ? today.getUTCMonth() + 1 : 12;
    targetCents = b.amountCents * BigInt(elapsed);
  }
  const pct = targetCents > 0n ? Math.round((Number(actualCents) * 100) / Number(targetCents)) : 0;
  return { id: b.id, label: b.label ?? b.accountCode, accountCode: b.accountCode, period: b.period, amountCents: b.amountCents, actualCents, targetCents, pct, over: actualCents > targetCents };
}
