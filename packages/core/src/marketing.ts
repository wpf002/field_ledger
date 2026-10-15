/**
 * Commodity exposure and marketing (spec §23): expected production against what's
 * sold, contracted, and still unpriced. Quantities are in each crop's own unit.
 */
export type ContractRec = {
  commodity: string; cropYear: number; type: string; quantity: number; unit: string;
  price: number | null; basis: number | null; delivered: number; status: string;
  deliveryStart: Date | null; deliveryEnd: Date | null; buyer?: string | null; number?: string | null;
};
export type SeasonRec = {
  crop: string; year: number; acres: number; expectedYield: number | null; totalProduction: number | null;
  qtySold: number | null; yieldUnit: string | null;
};
export type ExposureRow = {
  commodity: string; cropYear: number; unit: string;
  expected: number; sold: number; contracted: number; priced: number; unpriced: number; exposedPct: number | null;
  avgContractPrice: number | null; marketPrice: number | null; unpricedValue: number | null; nextDelivery: Date | null;
};

/** "Cotton (dryland)" -> "Cotton"; "Soybeans (2025 crop)" -> "Soybeans". */
export const commodityOf = (s: string) => s.split(/[\s(]/)[0]!.replace(/^./, (c) => c.toUpperCase());

/** Contract quantity still to deliver. Cancelled and delivered contracts carry none. */
export const openQuantity = (c: ContractRec) => (c.status === "open" ? Math.max(0, c.quantity - c.delivered) : 0);

/**
 * Basis and min-price contracts commit the bushels but leave futures open, so they
 * count as contracted, not priced. Forward and HTA contracts set the price.
 */
export const isPriced = (c: ContractRec) => c.price != null && (c.type === "forward" || c.type === "hta" || c.type === "delayed_price");

export function commodityExposure(seasons: SeasonRec[], contracts: ContractRec[], marketPrice: (commodity: string) => number | null): ExposureRow[] {
  const keys = new Map<string, { commodity: string; cropYear: number }>();
  for (const s of seasons) keys.set(`${commodityOf(s.crop)}|${s.year}`, { commodity: commodityOf(s.crop), cropYear: s.year });
  for (const c of contracts) keys.set(`${commodityOf(c.commodity)}|${c.cropYear}`, { commodity: commodityOf(c.commodity), cropYear: c.cropYear });
  return [...keys.values()].map(({ commodity, cropYear }) => {
    const ss = seasons.filter((s) => commodityOf(s.crop) === commodity && s.year === cropYear);
    const cs = contracts.filter((c) => commodityOf(c.commodity) === commodity && c.cropYear === cropYear);
    const expected = ss.reduce((a, s) => a + (s.totalProduction ?? (s.expectedYield ?? 0) * s.acres), 0);
    const sold = ss.reduce((a, s) => a + (s.qtySold ?? 0), 0);
    const contracted = cs.reduce((a, c) => a + openQuantity(c), 0);
    const pricedOpen = cs.filter(isPriced).reduce((a, c) => a + openQuantity(c), 0);
    const priced = sold + pricedOpen;
    const unpriced = Math.max(0, expected - priced);
    const pricedCs = cs.filter((c) => isPriced(c) && c.quantity > 0);
    const q = pricedCs.reduce((a, c) => a + c.quantity, 0);
    const mkt = marketPrice(commodity);
    const next = cs.filter((c) => openQuantity(c) > 0 && c.deliveryStart).map((c) => c.deliveryStart!).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    return {
      commodity, cropYear, unit: (ss[0]?.yieldUnit ?? cs[0]?.unit ?? "").replace(/\/\s*ac$/, "").trim(),
      expected, sold, contracted, priced, unpriced, exposedPct: expected > 0 ? unpriced / expected : null,
      avgContractPrice: q ? pricedCs.reduce((a, c) => a + c.price! * c.quantity, 0) / q : null,
      marketPrice: mkt, unpricedValue: mkt != null ? unpriced * mkt : null, nextDelivery: next,
    };
  }).sort((a, b) => b.cropYear - a.cropYear || a.commodity.localeCompare(b.commodity));
}
