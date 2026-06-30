import { prisma } from "@fl/db";
import { valueInventoryItem, latestPriceCents, sumCents, type Valuation } from "@fl/core";

export type ValuedItem = {
  item: Awaited<ReturnType<typeof prisma.inventoryItem.findMany>>[number];
  valuation: Valuation;
  marketPriceCents: bigint | null;
  marketSource: string | null;     // usda | cme | manual
};

/** Value every inventory item against the latest commodity quotes (mark-to-
 *  market), depreciating equipment to book value. Computed live — no static
 *  estValueCents (Phase 2). */
export async function getValuedInventory(farmId: string, asOf = new Date()): Promise<ValuedItem[]> {
  const [items, prices] = await Promise.all([
    prisma.inventoryItem.findMany({ where: { farmId }, orderBy: { createdAt: "asc" } }),
    prisma.commodityPrice.findMany(),
  ]);
  return items.map((item) => {
    const marketPriceCents = latestPriceCents(prices, item.marketSymbol);
    const src = item.marketSymbol ? prices.filter((p) => p.symbol === item.marketSymbol).sort((a, b) => b.asOf.getTime() - a.asOf.getTime())[0]?.source ?? null : null;
    return { item, valuation: valueInventoryItem(item, marketPriceCents, asOf), marketPriceCents, marketSource: src };
  });
}

export function inventoryTotals(valued: ValuedItem[]) {
  const assets = sumCents(valued.map((v) => v.valuation.valueCents));
  const marketable = sumCents(valued.filter((v) => v.valuation.marketable).map((v) => v.valuation.valueCents));
  return { assets, marketable };
}
