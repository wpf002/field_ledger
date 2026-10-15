import type { PrismaClient } from "@prisma/client";
import { commodityExposure, commodityOf, FUTURES, type ContractRec } from "@fl/core";

/**
 * Commodity exposure inputs for a farm: crop seasons, contracts, and a market price
 * per commodity (the latest inventory mark, else the latest futures quote).
 */
export async function loadCommodityExposure(prisma: PrismaClient, farmId: string, asOf?: Date) {
  const farm = await prisma.farm.findUnique({ where: { id: farmId }, select: { reportCutoff: true } });
  const at = asOf ?? farm?.reportCutoff ?? new Date();
  const [seasons, contracts, snaps, quotes, sales] = await Promise.all([
    prisma.cropSeason.findMany({ where: { farmId, year: { gte: at.getUTCFullYear() - 1 } } }),
    prisma.marketingContract.findMany({ where: { farmId }, orderBy: [{ cropYear: "desc" }, { deliveryStart: "asc" }] }),
    prisma.inventorySnapshot.findMany({ where: { farmId, asOf: { lte: at }, marketPerUnit: { not: null } }, orderBy: { asOf: "desc" }, select: { item: true, marketPerUnit: true } }),
    prisma.commodityPrice.findMany({ where: { source: "cme", asOf: { lte: at } }, orderBy: { asOf: "desc" }, take: 50 }),
    // Sold = units on revenue entries dated on or before the as-of date.
    prisma.transaction.findMany({ where: { farmId, entryType: "ledger", date: { gte: new Date(Date.UTC(at.getUTCFullYear() - 1, 0, 1)), lte: at }, quantity: { not: null }, account: { section: "REV" } }, select: { cropSeasonId: true, enterpriseId: true, date: true, quantity: true, unit: true } }),
  ]);
  // Tagged to a season when the books do that; otherwise the season's enterprise and calendar year, in its unit.
  const tagged = sales.some((x) => x.cropSeasonId);
  const soldFor = (s: (typeof seasons)[number]) => sales.filter((x) => tagged ? x.cropSeasonId === s.id
    : x.enterpriseId === s.enterpriseId && x.date.getUTCFullYear() === s.year && (s.yieldUnit ?? "").toLowerCase().startsWith((x.unit ?? "").toLowerCase().replace(/s$/, "")))
    .reduce((a, x) => a + Number(x.quantity), 0);
  const recs: (ContractRec & { id: string })[] = contracts.map((c) => ({
    id: c.id, number: c.number, commodity: c.commodity, cropYear: c.cropYear, type: c.type, quantity: Number(c.quantity), unit: c.unit,
    price: c.price == null ? null : Number(c.price), basis: c.basis == null ? null : Number(c.basis), delivered: Number(c.delivered),
    status: c.status, deliveryStart: c.deliveryStart, deliveryEnd: c.deliveryEnd, buyer: c.buyer,
  }));
  const marketPrice = (commodity: string) => {
    const mark = snaps.find((s) => commodityOf(s.item) === commodity);
    if (mark) return Number(mark.marketPerUnit);
    const root = FUTURES[commodity.toUpperCase()]?.root;
    const q = root ? quotes.find((x) => x.symbol === `${root}-FRONT`) : undefined;
    return q ? Number(q.priceCents) / 100 : null;
  };
  const rows = commodityExposure(
    seasons.map((s) => ({ crop: s.crop, year: s.year, acres: Number(s.acres), expectedYield: s.expectedYield == null ? null : Number(s.expectedYield), totalProduction: s.totalProduction == null ? null : Number(s.totalProduction), qtySold: soldFor(s), yieldUnit: s.yieldUnit })),
    recs, marketPrice,
  ).filter((r) => r.cropYear >= at.getUTCFullYear());
  return { asOf: at, rows, contracts: recs };
}
