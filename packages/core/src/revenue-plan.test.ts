import { describe, expect, it } from "vitest";
import { livestockRevenue, cropPlanRevenue } from "./revenue-plan.js";

describe("revenue plan", () => {
  it("livestock: calves x weight x price plus culls and other sales", () => {
    const r = livestockRevenue({ enterpriseId: "COM", breedingFemales: 100, weaningRate: 0.9, retained: 15, saleWeightLb: 550, pricePerCwt: 300, cullHead: 12, cullPrice: 1800, otherRevenue: 20000 });
    expect(r.calves).toBe(75);
    expect(r.calfRevenue).toBeCloseTo(123750);
    expect(r.total).toBeCloseTo(123750 + 21600 + 20000);
  });
  it("crops: contracted at contract price, the rest at expected price", () => {
    const r = cropPlanRevenue({ enterpriseId: "SOY", crop: "Soybeans", year: 2026, acres: 155, expectedYield: 50, expectedPrice: 10.3, contractedQty: 4000, contractedValue: 41800 });
    expect(r.production).toBe(7750);
    expect(r.total).toBeCloseTo(41800 + 3750 * 10.3);
    expect(cropPlanRevenue({ enterpriseId: null, crop: "Wheat", year: 2027, acres: 10, expectedYield: 50, expectedPrice: 5, contractedQty: 1000, contractedValue: 6000 }).total).toBeCloseTo(3000);
  });
});
