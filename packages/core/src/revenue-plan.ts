/**
 * Driver-based revenue forecast (spec §8). Livestock: calves from breeding females and
 * weaning rate, sold at a weight and $/cwt, plus culls and other sales (breeding stock,
 * beef orders, semen). Crops: the crop plan, contracted units at contract price and the
 * rest at the expected price. Everything else repeats the last 12 months.
 */
export type LivestockDriver = {
  enterpriseId: string; breedingFemales: number; weaningRate: number; retained: number;
  saleWeightLb: number; pricePerCwt: number; cullHead: number; cullPrice: number; otherRevenue: number;
};
export type CropPlanLine = { enterpriseId: string | null; crop: string; year: number; acres: number; expectedYield: number; expectedPrice: number; contractedQty: number; contractedValue: number };

export function livestockRevenue(d: LivestockDriver) {
  const calves = Math.max(0, d.breedingFemales * d.weaningRate - d.retained);
  const calfRevenue = calves * (d.saleWeightLb / 100) * d.pricePerCwt;
  const cullRevenue = d.cullHead * d.cullPrice;
  return { calves, calfRevenue, cullRevenue, total: calfRevenue + cullRevenue + d.otherRevenue };
}

export function cropPlanRevenue(l: CropPlanLine) {
  const production = l.acres * l.expectedYield;
  const contracted = Math.min(production, l.contractedQty);
  const unpriced = Math.max(0, production - contracted);
  // Contract value scales down if the plan expects less than what's contracted.
  const contractValue = l.contractedQty > 0 ? l.contractedValue * (contracted / l.contractedQty) : 0;
  return { production, contracted, unpriced, total: contractValue + unpriced * l.expectedPrice };
}
