import { cache } from "react";
import { prisma, loadEnterpriseInputs } from "@fl/db";
import { getStatementContext } from "./statements";

/** Enterprise structure + unit-economics inputs for the current farm (once per request). */
export const getEnterpriseContext = cache(async (farmId: string) => {
  const ctx = await getStatementContext(farmId);
  const ei = await loadEnterpriseInputs(prisma, farmId, ctx.inputs.cutoff);
  const years: number[] = [];
  for (let y = ctx.asOf.getUTCFullYear(); y > ctx.inputs.opening.asOf.getUTCFullYear(); y--) years.push(y);
  if (!years.length) years.push(ctx.asOf.getUTCFullYear());
  return { ...ctx, ...ei, years };
});

/** Period for a year: full calendar year, or year-to-date for the reporting year. */
export function yearPeriod(year: number, asOf: Date) {
  const from = new Date(Date.UTC(year - 1, 11, 31));
  const to = year === asOf.getUTCFullYear() ? asOf : new Date(Date.UTC(year, 11, 31));
  return { from, to, partial: year === asOf.getUTCFullYear() && asOf.getUTCMonth() < 11 };
}
