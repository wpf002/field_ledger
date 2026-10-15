import { cache } from "react";
import { prisma } from "@fl/db";
import {
  balanceSheetAt, thirteenWeekForecast, twelveMonthForecast, incomeStatement, DEFAULT_SCENARIOS,
  type Drivers, type ScenarioKey, type StatementRow,
} from "@fl/core";
import { getStatementContext } from "./statements";

export const SCENARIO_KEYS: ScenarioKey[] = ["base", "optimistic", "downside"];

/** Forecast settings and inputs for the current farm, as of its reporting date. */
export const getForecastContext = cache(async (farmId: string) => {
  const { inputs, asOf } = await getStatementContext(farmId);
  const [setting, line] = await Promise.all([
    prisma.forecastSetting.findUnique({ where: { farmId } }),
    prisma.liability.findFirst({ where: { farmId, type: "OPERATING_LINE" } }),
  ]);
  const saved = (setting?.scenarios ?? {}) as Partial<Record<ScenarioKey, Drivers>>;
  const drivers = Object.fromEntries(SCENARIO_KEYS.map((k) => [k, saved[k] ?? DEFAULT_SCENARIOS[k].drivers])) as Record<ScenarioKey, Drivers>;
  const bs = balanceSheetAt(inputs, asOf);
  const lineTerms = line ? { limitCents: line.limitCents ?? line.originalCents, ratePct: Number(line.ratePct), balanceCents: bs.operatingLineCents } : null;
  const reserveCents = setting?.reserveCents ?? 2_500_000n;
  const base = { rows: inputs.rows, asOf, cashCents: bs.cashCents, loans: inputs.loans, assets: inputs.assets, line: lineTerms, reserveCents };
  return {
    asOf, reserveCents, drivers, lineTerms, inputs,
    thirteen: (k: ScenarioKey) => thirteenWeekForecast({ ...base, drivers: drivers[k] }),
    twelve: (k: ScenarioKey) => twelveMonthForecast({ ...base, drivers: drivers[k] }),
  };
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
