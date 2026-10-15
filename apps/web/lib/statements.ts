import { cache } from "react";
import { prisma, loadStatementInputs } from "@fl/db";
import { monthEnds, balanceSheetAt, type InventorySnap, type AssetRec } from "@fl/core";
import { getValuedInventory } from "./valuation";

const LEGACY_CATEGORY: Record<string, string> = { LIVESTOCK: "Livestock - breeding", FEED: "Feed - hay", CROPS: "Crops - grain", SUPPLIES: "Semen inventory" };

/** Statement inputs for the current farm, loaded once per request. */
export const getStatementContext = cache(async (farmId: string) => {
  const inputs = await loadStatementInputs(prisma, farmId);
  const now = new Date();
  const lastClosed = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const asOf = inputs.cutoff ?? lastClosed;
  // Farms on the starter model keep inventory and equipment as InventoryItems; value them
  // (mark-to-market, equipment at book) as of the reporting date so the balance sheet sees them.
  if (inputs.inventory.length === 0 && inputs.assets.length === 0) {
    const valued = await getValuedInventory(farmId, asOf);
    const snaps: InventorySnap[] = [];
    const assets: AssetRec[] = [];
    for (const v of valued) {
      if (v.item.category === "EQUIPMENT") {
        // Held at today's book value: these farms don't post depreciation entries.
        assets.push({ category: "Machinery & equipment", purchasedAt: inputs.opening.asOf, originalCostCents: v.valuation.valueCents, salvageCents: 0n, usefulLifeYears: null, disposedAt: null });
      } else {
        for (const m of [inputs.opening.asOf, ...monthEnds(new Date(inputs.opening.asOf.getTime() + 86_400_000), asOf)]) {
          snaps.push({ asOf: m, category: LEGACY_CATEGORY[v.item.category] ?? "Semen inventory", bsValuation: "market", costBasisCents: v.item.costBasisCents ?? 0n, marketValueCents: v.valuation.valueCents });
        }
      }
    }
    inputs.inventory = snaps;
    inputs.assets = assets;
  }
  // Without an opening balance sheet, open equity at whatever balances the books on day one.
  if (!inputs.hasOpeningBalances) inputs.opening.retainedCents = balanceSheetAt(inputs, inputs.opening.asOf).balanceCheckCents;
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
