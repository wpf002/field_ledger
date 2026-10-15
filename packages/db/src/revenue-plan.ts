import type { PrismaClient } from "@prisma/client";
import { enterpriseStatements, livestockRevenue, commodityOf, isPriced, openQuantity, type LivestockDriver, type StatementRow, type ContractRec } from "@fl/core";
import { loadCommodityExposure } from "./marketing.js";

export type RevenuePlanRow = {
  enterpriseId: string; name: string; basis: "livestock drivers" | "crop plan" | "prior 12 months";
  lastCents: bigint; planCents: bigint; driver?: LivestockDriver & { calves: number }; detail?: string;
};

const CALF = /feeder|commercial|calf|calves|steer|weaned|stocker/i;
const CULL = /cull/i;

/**
 * Revenue forecast for the 12 months after `asOf` (spec §8). Default livestock drivers
 * are fitted to the last 12 months so an untouched plan repeats last year; saved
 * drivers in ForecastSetting.revenueDrivers override them per enterprise.
 */
export async function loadRevenuePlan(prisma: PrismaClient, farmId: string, rows: StatementRow[], asOf: Date): Promise<RevenuePlanRow[]> {
  const from = new Date(Date.UTC(asOf.getUTCFullYear() - 1, asOf.getUTCMonth() + 1, 0));
  const [enterprises, setting, headSales, sold, cows, repro, seasons, contracts, exposure] = await Promise.all([
    prisma.enterprise.findMany({ where: { farmId } }),
    prisma.forecastSetting.findUnique({ where: { farmId } }),
    prisma.transaction.findMany({ where: { farmId, entryType: "ledger", unit: "head", date: { gt: from, lte: asOf }, account: { section: "REV" } }, select: { enterpriseId: true, quantity: true, amountCents: true, account: { select: { label: true } } } }),
    prisma.animal.findMany({ where: { farmId, dispositionDate: { gt: from, lte: asOf }, saleWeightLb: { not: null }, salePriceCents: { not: null } }, select: { currentClass: true, saleWeightLb: true } }),
    prisma.animal.count({ where: { farmId, status: "On hand", currentClass: { in: ["Cows", "Brood cows", "Mature cows"] } } }),
    prisma.reproductionYear.findMany({ where: { farmId }, orderBy: { year: "desc" } }),
    prisma.cropSeason.findMany({ where: { farmId, year: { gte: asOf.getUTCFullYear() } }, select: { crop: true, year: true, enterpriseId: true, expectedPrice: true } }),
    prisma.marketingContract.findMany({ where: { farmId, status: "open" } }),
    loadCommodityExposure(prisma, farmId, asOf),
  ]);
  const saved = ((setting?.revenueDrivers ?? {}) as { livestock?: Record<string, Partial<LivestockDriver>> }).livestock ?? {};
  const last = enterpriseStatements(rows, from, asOf);
  const r0 = repro.find((r) => (r.data as Record<string, unknown>).weaning_rate != null)?.data as Record<string, number> | undefined;
  const calfWeights = sold.filter((a) => CALF.test(a.currentClass ?? "")).map((a) => Number(a.saleWeightLb));
  const avgCalfWt = calfWeights.length ? calfWeights.reduce((a, b) => a + b, 0) / calfWeights.length : 550;
  const females = Number((repro[0]?.data as Record<string, number> | undefined)?.females_calving ?? cows);

  // Crops: unpriced units at the season's expected price (else market), open priced contracts at contract price.
  const cropByEnt = new Map<string, { cents: number; detail: string[] }>();
  // Next season sells the share of production the farm actually sold last season.
  const sellThrough = (commodity: string) => {
    const past = exposure.rows.filter((x) => x.commodity === commodity && x.cropYear <= asOf.getUTCFullYear() && x.expected > 0 && x.sold > 0).sort((a, b) => b.cropYear - a.cropYear)[0];
    // Sold plus what's still in storage; the rest of production was lost or never sold.
    return past ? Math.min(1, Math.max(0.2, (past.sold + past.unpriced + past.contracted) / past.expected)) : 1;
  };
  for (const r of exposure.rows) {
    const s = seasons.find((x) => commodityOf(x.crop) === r.commodity && x.year === r.cropYear);
    if (!s?.enterpriseId) continue;
    const price = s.expectedPrice != null ? Number(s.expectedPrice) : r.marketPrice ?? 0;
    const cs = contracts.filter((c) => commodityOf(c.commodity) === r.commodity && c.cropYear === r.cropYear)
      .map((c) => ({ type: c.type, price: c.price == null ? null : Number(c.price), quantity: Number(c.quantity), delivered: Number(c.delivered), status: c.status }) as ContractRec);
    const contracted = cs.filter(isPriced).reduce((a, c) => a + openQuantity(c) * c.price!, 0);
    const st = r.cropYear > asOf.getUTCFullYear() ? sellThrough(r.commodity) : 1;
    const units = r.unpriced * st;
    const x = cropByEnt.get(s.enterpriseId) ?? { cents: 0, detail: [] };
    x.cents += Math.round((contracted + units * price) * 100);
    x.detail.push(`${r.commodity} ${r.cropYear}: ${Math.round(units).toLocaleString("en-US")} ${r.unit} at $${price.toFixed(2)}${st < 1 ? ` (${Math.round(st * 100)}% sell-through)` : ""}${contracted ? ` + contracts $${Math.round(contracted).toLocaleString("en-US")}` : ""}`);
    cropByEnt.set(s.enterpriseId, x);
  }

  const out: RevenuePlanRow[] = [];
  for (const e of enterprises) {
    const lastCents = last.get(e.id)?.revenueCents ?? 0n;
    const crop = cropByEnt.get(e.id);
    const heads = headSales.filter((t) => t.enterpriseId === e.id);
    if (crop) { out.push({ enterpriseId: e.id, name: e.name, basis: "crop plan", lastCents, planCents: BigInt(crop.cents), detail: crop.detail.join("; ") }); continue; }
    if (heads.length) {
      const calfRows = heads.filter((t) => CALF.test(t.account.label) && !CULL.test(t.account.label));
      const cullRows = heads.filter((t) => CULL.test(t.account.label));
      const sum = (xs: typeof heads, k: "quantity" | "amountCents") => xs.reduce((a, t) => a + Number(t[k] ?? 0), 0);
      const calfHead = sum(calfRows, "quantity"), calfRev = sum(calfRows, "amountCents") / 100;
      const cullHead = sum(cullRows, "quantity"), cullRev = sum(cullRows, "amountCents") / 100;
      const wean = calfHead ? Number(r0?.weaning_rate ?? 0.9) : 0;
      const f = calfHead ? females : 0;
      const def: LivestockDriver = {
        enterpriseId: e.id, breedingFemales: f, weaningRate: wean, retained: calfHead ? Math.max(0, Math.round(f * wean - calfHead)) : 0,
        saleWeightLb: Math.round(avgCalfWt), pricePerCwt: calfHead ? Math.round((calfRev / (calfHead * avgCalfWt / 100)) * 100) / 100 : 0,
        cullHead, cullPrice: cullHead ? Math.round(cullRev / cullHead) : 0,
        otherRevenue: Math.max(0, Math.round(Number(lastCents) / 100 - calfRev - cullRev)),
      };
      const d = { ...def, ...(saved[e.id] ?? {}) };
      const r = livestockRevenue(d);
      out.push({ enterpriseId: e.id, name: e.name, basis: "livestock drivers", lastCents, planCents: BigInt(Math.round(r.total * 100)), driver: { ...d, calves: r.calves } });
      continue;
    }
    if (lastCents !== 0n) out.push({ enterpriseId: e.id, name: e.name, basis: "prior 12 months", lastCents, planCents: lastCents });
  }
  return out.sort((a, b) => Number(b.planCents - a.planCents));
}
