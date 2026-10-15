import type { PrismaClient } from "@prisma/client";
import { commodityExposure, commodityOf, commodityKey, isPriced, openQuantity, FUTURES, type ContractRec, type ContractFlow } from "@fl/core";

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
    prisma.inventorySnapshot.findMany({ where: { farmId, asOf: { lte: at }, marketPerUnit: { not: null } }, orderBy: { asOf: "desc" }, select: { item: true, marketPerUnit: true, asOf: true, quantity: true, category: true } }),
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
    const mark = snaps.find((s) => commodityKey(s.item) === commodityKey(commodity));
    if (mark) return Number(mark.marketPerUnit);
    const root = FUTURES[commodity.toUpperCase()]?.root;
    const q = root ? quotes.find((x) => x.symbol === `${root}-FRONT`) : undefined;
    return q ? Number(q.priceCents) / 100 : null;
  };
  // Units in storage at the as-of date (latest snapshot), for crops whose harvest is done.
  const lastSnap = snaps.reduce<Date | null>((m, s) => (!m || s.asOf > m ? s.asOf : m), null);
  const storedOf = (crop: string) => snaps.filter((s) => lastSnap && s.asOf.getTime() === lastSnap.getTime() && !/growing/i.test(s.category) && commodityKey(s.item) === commodityKey(crop)).reduce((a, s) => a + Number(s.quantity), 0);
  const rows = commodityExposure(
    seasons.map((s) => ({ crop: s.crop, year: s.year, acres: Number(s.acres), harvestStart: s.harvestStart, harvestEnd: s.harvestEnd, stored: storedOf(s.crop), expectedYield: s.expectedYield == null ? null : Number(s.expectedYield), totalProduction: s.totalProduction == null ? null : Number(s.totalProduction), qtySold: soldFor(s), yieldUnit: s.yieldUnit })),
    recs, marketPrice, at,
  ).filter((r) => r.cropYear >= at.getUTCFullYear());
  return { asOf: at, rows, contracts: recs };
}

/** Priced, open contracts as forecast receipts, each tied to its crop's enterprise. */
export async function contractFlowsFor(prisma: PrismaClient, farmId: string): Promise<ContractFlow[]> {
  const [contracts, seasons] = await Promise.all([
    prisma.marketingContract.findMany({ where: { farmId, status: "open" } }),
    prisma.cropSeason.findMany({ where: { farmId }, select: { crop: true, year: true, enterpriseId: true }, orderBy: { year: "desc" } }),
  ]);
  return contracts.flatMap((c) => {
    const rec = { type: c.type, price: c.price == null ? null : Number(c.price), quantity: Number(c.quantity), delivered: Number(c.delivered), status: c.status } as ContractRec;
    if (!isPriced(rec)) return [];
    const qty = openQuantity(rec);
    const date = c.deliveryEnd ?? c.deliveryStart;
    if (!qty || !date) return [];
    const ent = seasons.find((s) => commodityOf(s.crop) === commodityOf(c.commodity) && s.year === c.cropYear) ?? seasons.find((s) => commodityOf(s.crop) === commodityOf(c.commodity));
    return [{ date, cents: BigInt(Math.round(qty * rec.price! * 100)), enterpriseId: ent?.enterpriseId ?? null, description: `${c.number ?? "Contract"} ${c.commodity.toLowerCase()}` }];
  });
}

/** Crop and feed in storage at the latest snapshot, at market, for sell-or-hold. */
export async function storedCommodities(prisma: PrismaClient, farmId: string) {
  const last = await prisma.inventorySnapshot.findFirst({ where: { farmId }, orderBy: { asOf: "desc" }, select: { asOf: true } });
  if (!last) return [];
  const snaps = await prisma.inventorySnapshot.findMany({ where: { farmId, asOf: last.asOf, bsValuation: "market", marketPerUnit: { not: null }, OR: [{ category: { startsWith: "Crops" } }, { category: { startsWith: "Feed" } }] } });
  const line = await prisma.liability.findFirst({ where: { farmId, type: "OPERATING_LINE" }, select: { ratePct: true } });
  // Lots worth deciding on (at least $100 at market), largest first.
  return snaps.filter((s) => Number(s.quantity) * Number(s.marketPerUnit) >= 100 && !/growing/i.test(s.category))
    .sort((a, b) => Number(b.quantity) * Number(b.marketPerUnit) - Number(a.quantity) * Number(a.marketPerUnit)).map((s) => ({
    key: s.itemKey, item: s.item, unit: s.unit ?? "unit", quantity: Number(s.quantity), priceNow: Number(s.marketPerUnit), interestPct: line ? Number(line.ratePct) : 8,
  }));
}
