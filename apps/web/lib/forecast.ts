import { cache } from "react";
import { prisma, forecastContext, SCENARIO_KEYS } from "@fl/db";
import { balanceSheetAt, twelveMonthForecast, incomeStatement, type StatementRow } from "@fl/core";
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
export function backtest(ctx: Awaited<ReturnType<typeof getForecastContext>>, months = 12) {
  const asOf = new Date(Date.UTC(ctx.asOf.getUTCFullYear(), ctx.asOf.getUTCMonth() - months + 1, 0));
  const t = asOf.getTime();
  const known = ctx.inputs.rows
    .filter((r) => r.date.getTime() <= t || (r.cashDate && r.cashDate.getTime() <= t))
    .map((r) => (r.cashDate && r.cashDate.getTime() > t ? { ...r, cashDate: null, cashEffectCents: null, expectedCashDate: r.cashDate } : r));
  const bs = balanceSheetAt({ ...ctx.inputs, rows: known }, asOf);
  const fc = twelveMonthForecast({
    rows: known, asOf, cashCents: bs.cashCents, loans: ctx.inputs.loans, assets: ctx.inputs.assets, reserveCents: ctx.reserveCents, drivers: ctx.drivers.base,
    line: ctx.lineTerms ? { ...ctx.lineTerms, balanceCents: bs.operatingLineCents } : null,
  });
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
