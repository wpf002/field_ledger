import { cache } from "react";
import { prisma, loadStatementInputs } from "@fl/db";
import { monthEnds } from "@fl/core";

/** Statement inputs for the current farm, loaded once per request. */
export const getStatementContext = cache(async (farmId: string) => {
  const inputs = await loadStatementInputs(prisma, farmId);
  const now = new Date();
  const lastClosed = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const asOf = inputs.cutoff ?? lastClosed;
  const months = monthEnds(new Date(inputs.opening.asOf.getTime() + 86_400_000), asOf);
  return { inputs, asOf, months };
});

/** "2026-09" -> that month-end, clamped to the available range. */
export function pickMonth(months: Date[], param: string | undefined, fallback: Date): Date {
  if (param && /^\d{4}-\d{2}$/.test(param)) {
    const hit = months.find((m) => m.toISOString().slice(0, 7) === param);
    if (hit) return hit;
  }
  return fallback;
}
export const monthKey = (d: Date) => d.toISOString().slice(0, 7);
