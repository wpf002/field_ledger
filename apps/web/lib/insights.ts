import { cache } from "react";
import { prisma, generateInsights, generateBrief } from "@fl/db";
import { getForecastContext } from "./forecast";

const ORDER = { Critical: 0, Warning: 1, Watch: 2, Opportunity: 3, Positive: 4 } as const;

/** Insights for the current farm, most urgent first (once per request). */
export const getInsights = cache(async (farmId: string) =>
  (await generateInsights(prisma, farmId)).sort((a, b) => ORDER[a.severity] - ORDER[b.severity]));

export const getBrief = cache(async (farmId: string, kind: "weekly" | "monthly") =>
  generateBrief(prisma, farmId, kind, await getForecastContext(farmId)));
