/**
 * Phase 2 forecasting seam. The Insights cashflow projection runs through a
 * `Forecaster` so the model is swappable. The roadmap's Prophet service (a
 * Python microservice) implements this same interface, trained on `history`;
 * it is NOT wired in this build (no Prophet service or keys), so the default is
 * a documented naive baseline. Swapping in Prophet is a drop-in replacement.
 */
export type MonthFlow = { month: string; incomeCents: bigint; expenseCents: bigint };

export interface Forecaster {
  readonly name: string;
  /** Project the given future `months` from historical monthly flows and the
   *  expected window totals (e.g. marketable-inventory value + obligations). */
  project(history: MonthFlow[], months: string[], windowIncomeCents: bigint, windowExpenseCents: bigint): MonthFlow[];
}

/** Baseline: spread the window totals evenly across the projected months.
 *  Prophet replaces this with a trend+seasonality fit over `history`. */
export const naiveForecaster: Forecaster = {
  name: "naive",
  project(_history, months, windowIncomeCents, windowExpenseCents) {
    const n = BigInt(months.length || 1);
    return months.map((month) => ({ month, incomeCents: windowIncomeCents / n, expenseCents: windowExpenseCents / n }));
  },
};
