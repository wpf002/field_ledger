import type { PrismaClient } from "@prisma/client";
import type { CropSeasonRec } from "@fl/core";

/** Crop seasons, enterprise depreciation by year, and unit counts for unit economics. */
export async function loadEnterpriseInputs(prisma: PrismaClient, farmId: string, cutoff: Date | null) {
  const [enterprises, seasons, deps, counts] = await Promise.all([
    prisma.enterprise.findMany({ where: { farmId }, orderBy: { code: "asc" } }),
    prisma.cropSeason.findMany({ where: { farmId }, orderBy: [{ year: "asc" }, { crop: "asc" }] }),
    prisma.assetDepreciation.findMany({ where: { asset: { farmId } } }),
    prisma.enterpriseUnitCount.findMany({ where: { farmId } }),
  ]);
  const parentOf = new Map(enterprises.map((e) => [e.id, e.parentId]));
  const cropSeasons: (CropSeasonRec & { dataType: string | null; expectedYield: number | null; expectedPrice: number | null; planned: boolean })[] = seasons.map((s) => {
    const extra = (s.extra ?? {}) as Record<string, unknown>;
    return {
      id: s.id, enterpriseId: s.enterpriseId, parentEnterpriseId: s.enterpriseId ? parentOf.get(s.enterpriseId) ?? null : null, crop: s.crop, year: s.year,
      acres: Number(s.acres), actualYield: s.actualYield == null ? null : Number(s.actualYield), actualAvgPrice: s.actualAvgPrice == null ? null : Number(s.actualAvgPrice),
      yieldUnit: s.yieldUnit, expectedYield: s.expectedYield == null ? null : Number(s.expectedYield), expectedPrice: s.expectedPrice == null ? null : Number(s.expectedPrice),
      planned: s.dataType != null && s.dataType !== "Actual" && !/^Actual/.test(s.dataType), qtyStoredEnd: typeof extra.qty_stored_end === "number" ? extra.qty_stored_end : null, dataType: s.dataType,
    };
  });
  // Annual depreciation by enterprise; the in-progress year is annualized from the months booked.
  const depreciationByEnterpriseYear = new Map<string, bigint>();
  for (const d of deps) {
    if (!d.enterpriseId) continue;
    const k = `${d.enterpriseId}|${d.year}`;
    depreciationByEnterpriseYear.set(k, (depreciationByEnterpriseYear.get(k) ?? 0n) + d.amountCents);
  }
  if (cutoff && cutoff.getUTCMonth() < 11) {
    const months = BigInt(cutoff.getUTCMonth() + 1), y = cutoff.getUTCFullYear();
    for (const [k, v] of depreciationByEnterpriseYear) if (k.endsWith(`|${y}`)) depreciationByEnterpriseYear.set(k, (v * 12n) / months);
  }
  return { enterprises, cropSeasons, depreciationByEnterpriseYear, unitCounts: counts };
}
