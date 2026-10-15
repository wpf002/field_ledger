import type { PrismaClient } from "@prisma/client";
import { balanceSheetAt, thirteenWeekForecast, twelveMonthForecast, DEFAULT_SCENARIOS, type Drivers, type ScenarioKey } from "@fl/core";
import { loadStatementInputs } from "./statement-inputs.js";

export const SCENARIO_KEYS: ScenarioKey[] = ["base", "optimistic", "downside"];

/** Forecast settings and inputs for a farm, as of its reporting date. */
export async function forecastContext(prisma: PrismaClient, farmId: string, preloaded?: Awaited<ReturnType<typeof loadStatementInputs>> & { asOf?: Date }) {
  const inputs = preloaded ?? (await loadStatementInputs(prisma, farmId));
  const now = new Date();
  const asOf = preloaded?.asOf ?? inputs.cutoff ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const [setting, line] = await Promise.all([
    prisma.forecastSetting.findUnique({ where: { farmId } }),
    prisma.liability.findFirst({ where: { farmId, type: "OPERATING_LINE" } }),
  ]);
  const saved = (setting?.scenarios ?? {}) as Partial<Record<ScenarioKey, Drivers>>;
  const drivers = Object.fromEntries(SCENARIO_KEYS.map((k) => [k, saved[k] ?? DEFAULT_SCENARIOS[k].drivers])) as Record<ScenarioKey, Drivers>;
  const bs = balanceSheetAt(inputs, asOf);
  const lineTerms = line ? { limitCents: line.limitCents ?? line.originalCents, ratePct: Number(line.ratePct), balanceCents: bs.operatingLineCents } : null;
  const reserveCents = setting?.reserveCents ?? defaultReserve(inputs.rows, asOf);
  const base = { rows: inputs.rows, asOf, cashCents: bs.cashCents, loans: inputs.loans, assets: inputs.assets, line: lineTerms, reserveCents };
  return {
    asOf, reserveCents, drivers, lineTerms, inputs,
    thirteen: (k: ScenarioKey) => thirteenWeekForecast({ ...base, drivers: drivers[k] }),
    twelve: (k: ScenarioKey) => twelveMonthForecast({ ...base, drivers: drivers[k] }),
  };
}
export type ForecastContext = Awaited<ReturnType<typeof forecastContext>>;

/** Without a saved target: half a month of last year's average operating payments, to the nearest $1,000. */
function defaultReserve(rows: { cashDate: Date | null; cashEffectCents: bigint | null; section: string }[], asOf: Date): bigint {
  const from = asOf.getTime() - 365 * 86_400_000;
  let out = 0n;
  for (const r of rows) if (r.cashDate && r.cashEffectCents && r.cashEffectCents < 0n && r.section !== "CASHBS" && r.cashDate.getTime() > from && r.cashDate.getTime() <= asOf.getTime()) out -= r.cashEffectCents;
  return ((out / 24n + 50_000n) / 100_000n) * 100_000n;
}
