import { cache } from "react";
import { prisma, forecastContext, SCENARIO_KEYS } from "@fl/db";
import { balanceSheetAt, twelveMonthForecast, incomeStatement, fromSections, type StatementRow, type IncomeStatement } from "@fl/core";
import { getStatementContext } from "./statements";

export { SCENARIO_KEYS };

/** Forecast settings and inputs for the current farm, as of its reporting date (once per request). */
export const getForecastContext = cache(async (farmId: string) => {
  const { inputs, asOf } = await getStatementContext(farmId);
  return forecastContext(prisma, farmId, { ...inputs, asOf });
});

/**
 * Backtest: rerun the forecast as if it were `months` earlier, using only what was known then
 * (items paid later count as open, expected on the date they actually settled), and compare
 * each month with what happened.
 */
type Ctx = Awaited<ReturnType<typeof getForecastContext>>;

/** The base forecast as it would have run at `asOf`, from only what was known then. */
function forecastAsOf(ctx: Ctx, asOf: Date) {
  const t = asOf.getTime();
  const known = ctx.inputs.rows
    .filter((r) => r.date.getTime() <= t || (r.cashDate && r.cashDate.getTime() <= t))
    .map((r) => (r.cashDate && r.cashDate.getTime() > t ? { ...r, cashDate: null, cashEffectCents: null, expectedCashDate: r.cashDate } : r));
  const bs = balanceSheetAt({ ...ctx.inputs, rows: known }, asOf);
  return twelveMonthForecast({
    rows: known, asOf, cashCents: bs.cashCents, loans: ctx.inputs.loans, assets: ctx.inputs.assets, reserveCents: ctx.reserveCents, drivers: ctx.drivers.base,
    line: ctx.lineTerms ? { ...ctx.lineTerms, balanceCents: bs.operatingLineCents } : null,
  });
}

/**
 * Forecast income statement for a period (spec §3 "compare against forecast"): the
 * forecast made at the period's start, summed over its months. Inventory and livestock
 * value changes aren't forecast, so net farm income equals operating net income.
 */
export function forecastStatement(ctx: Ctx, from: Date, to: Date): IncomeStatement {
  const start = from.getTime() < ctx.asOf.getTime() ? from : ctx.asOf;
  const months = forecastAsOf(ctx, start).filter((m) => m.monthEnd.getTime() > from.getTime() && m.monthEnd.getTime() <= to.getTime());
  const sum = (k: keyof IncomeStatement) => months.reduce((a, m) => a + (m.pnl[k] as bigint), 0n);
  return fromSections({ REV: sum("revenueCents"), XFER: sum("transfersCents"), COP: -sum("copCents"), OVH: -sum("overheadCents"), DEP: -sum("depreciationCents"), INT: -sum("interestCents") });
}

export function backtest(ctx: Ctx, months = 12) {
  const asOf = new Date(Date.UTC(ctx.asOf.getUTCFullYear(), ctx.asOf.getUTCMonth() - months + 1, 0));
  const fc = forecastAsOf(ctx, asOf);
  return {
    asOf,
    months: fc.map((m) => {
      const from = new Date(Date.UTC(m.monthEnd.getUTCFullYear(), m.monthEnd.getUTCMonth(), 0));
      const actual = incomeStatement(ctx.inputs.rows as StatementRow[], from, m.monthEnd);
      // Compare net cash (cash less operating line) so differences in line timing don't count as misses.
      const bsA = balanceSheetAt(ctx.inputs, m.monthEnd);
      return { monthEnd: m.monthEnd, forecast: m.pnl, actual, forecastNetCash: m.cash.endingCashCents - m.cash.lineBalanceCents, actualNetCash: bsA.cashCents - bsA.operatingLineCents };
    }).filter((m) => m.monthEnd.getTime() <= ctx.asOf.getTime()),
  };
}
