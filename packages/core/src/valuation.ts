/**
 * Phase 2 asset valuation (pure, integer cents):
 *  - straight-line depreciation -> equipment book value
 *  - mark-to-market with manual-override precedence -> livestock/crop value
 *  - tax cost basis (raised livestock has $0 basis; purchased carries its cost)
 *
 * MACRS / Section 179 and live CME/USDA feeds are future work; this models the
 * cash-basis book value the dashboards need today.
 */

const DAY = 86_400_000;

export type Depreciation = {
  method: "straight_line";
  annualCents: bigint;
  accumulatedCents: bigint;
  bookValueCents: bigint;
  elapsedDays: number;
};

/** Straight-line: (cost − salvage) / life, prorated by days, floored at salvage. */
export function straightLineDepreciation(
  costCents: bigint, salvageCents: bigint, usefulLifeYears: number, acquiredAt: Date, asOf: Date,
): Depreciation {
  const depreciable = costCents - salvageCents > 0n ? costCents - salvageCents : 0n;
  const annualCents = usefulLifeYears > 0 ? depreciable / BigInt(usefulLifeYears) : 0n;
  const elapsedDays = Math.max(0, Math.floor((asOf.getTime() - acquiredAt.getTime()) / DAY));
  let accumulated = (annualCents * BigInt(elapsedDays)) / 365n;
  if (accumulated > depreciable) accumulated = depreciable;
  return { method: "straight_line", annualCents, accumulatedCents: accumulated, bookValueCents: costCents - accumulated, elapsedDays };
}

/** Accepts plain numbers/strings or Prisma Decimal (anything with toString). */
export type Decimalish = number | string | { toString(): string };
const asNumber = (q: Decimalish) => Number(typeof q === "object" ? q.toString() : q);

/** qty × per-unit price in integer cents, rounded to the nearest cent.
 *  Quantity carries up to 4 decimals (Prisma Decimal(_,4)). */
export function unitsTimesPrice(priceCents: bigint, quantity: Decimalish): bigint {
  const qtyScaled = BigInt(Math.round(asNumber(quantity) * 10_000)); // 4dp fixed-point
  const product = priceCents * qtyScaled;
  return (product + 5_000n) / 10_000n; // round half-up (prices are non-negative)
}

export type ValuationItem = {
  category: string;
  quantity: Decimalish;
  unitValueCents?: bigint | null;   // manual override per unit
  costBasisCents?: bigint | null;
  acquiredAt?: Date | string | null;
  usefulLifeYears?: number | null;
  salvageCents?: bigint | null;
  basisType?: string | null;        // RAISED | PURCHASED
};

export type ValuationSource = "depreciated" | "override" | "market" | "none";
export type Valuation = {
  method: ValuationSource;
  valueCents: bigint;
  unitPriceCents: bigint | null;    // effective per-unit price (book value for equipment)
  source: ValuationSource;
  costBasisCents: bigint;           // tax basis
  marketable: boolean;
  depreciation?: Depreciation;
};

/** Tax cost basis: raised livestock/crops were expensed -> $0; purchased carries cost. */
export function taxBasisCents(item: ValuationItem): bigint {
  if (item.basisType === "RAISED") return 0n;
  return item.costBasisCents ?? 0n;
}

const MARKETABLE = new Set(["LIVESTOCK", "CROPS"]);

/** Value one inventory item. Equipment -> depreciated book value; everything
 *  else -> qty × (override ?? market price). */
export function valueInventoryItem(item: ValuationItem, marketPriceCents: bigint | null, asOf: Date): Valuation {
  const marketable = MARKETABLE.has(item.category);

  if (item.category === "EQUIPMENT" && item.costBasisCents != null && item.acquiredAt && item.usefulLifeYears) {
    const dep = straightLineDepreciation(item.costBasisCents, item.salvageCents ?? 0n, item.usefulLifeYears, new Date(item.acquiredAt), asOf);
    return { method: "depreciated", valueCents: dep.bookValueCents, unitPriceCents: dep.bookValueCents, source: "depreciated", costBasisCents: taxBasisCents(item), marketable, depreciation: dep };
  }

  const override = item.unitValueCents ?? null;
  const price = override ?? marketPriceCents ?? null;
  const source: ValuationSource = override != null ? "override" : marketPriceCents != null ? "market" : "none";
  const valueCents = price == null ? 0n : unitsTimesPrice(price, item.quantity);
  return { method: source, valueCents, unitPriceCents: price, source, costBasisCents: taxBasisCents(item), marketable };
}

/** Latest quote for a symbol from a quote list (newest asOf wins). */
export function latestPriceCents(prices: { symbol: string; priceCents: bigint; asOf: Date | string }[], symbol?: string | null): bigint | null {
  if (!symbol) return null;
  const rows = prices.filter((p) => p.symbol === symbol);
  if (!rows.length) return null;
  rows.sort((a, b) => new Date(b.asOf).getTime() - new Date(a.asOf).getTime());
  return rows[0]!.priceCents;
}
