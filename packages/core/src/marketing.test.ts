import { describe, expect, it } from "vitest";
import { commodityExposure, commodityOf, isPriced, type ContractRec } from "./marketing.js";

const contract = (o: Partial<ContractRec>): ContractRec => ({ commodity: "Soybeans", cropYear: 2026, type: "forward", quantity: 4000, unit: "bu", price: 10.45, basis: null, delivered: 0, status: "open", deliveryStart: new Date("2026-11-01"), deliveryEnd: new Date("2026-11-30"), ...o });

describe("commodity exposure", () => {
  it("counts sold and priced contracts against expected production", () => {
    const rows = commodityExposure(
      [{ crop: "Soybeans", year: 2026, acres: 160, expectedYield: 50, totalProduction: null, qtySold: 0, yieldUnit: "bu/ac" }],
      [contract({})],
      () => 10.2,
    );
    expect(rows).toHaveLength(1);
    const r = rows[0]!;
    expect(r.expected).toBe(8000);
    expect(r.priced).toBe(4000);
    expect(r.unpriced).toBe(4000);
    expect(r.exposedPct).toBe(0.5);
    expect(r.unpricedValue).toBeCloseTo(40800);
    expect(r.avgContractPrice).toBe(10.45);
    expect(r.unit).toBe("bu");
  });
  it("basis contracts commit bushels but leave the price open", () => {
    const basis = contract({ type: "basis", price: null, basis: -0.35 });
    expect(isPriced(basis)).toBe(false);
    const r = commodityExposure([{ crop: "Corn", year: 2026, acres: 100, expectedYield: 180, totalProduction: null, qtySold: 2000, yieldUnit: "bu/ac" }], [{ ...basis, commodity: "Corn", quantity: 5000 }], () => null)[0]!;
    expect(r.contracted).toBe(5000);
    expect(r.priced).toBe(2000);
    expect(r.unpriced).toBe(16000);
    expect(r.unpricedValue).toBeNull();
  });
  it("delivered and cancelled contracts carry no open quantity", () => {
    const r = commodityExposure([{ crop: "Wheat", year: 2026, acres: 50, expectedYield: null, totalProduction: 2000, qtySold: 2000, yieldUnit: "bu/ac" }],
      [contract({ commodity: "Wheat", quantity: 1000, delivered: 1000 }), contract({ commodity: "Wheat", status: "cancelled" })], () => 5.5)[0]!;
    expect(r.contracted).toBe(0);
    expect(r.unpriced).toBe(0);
  });
  it("normalizes crop names", () => {
    expect(commodityOf("Cotton (dryland)")).toBe("Cotton");
    expect(commodityOf("corn")).toBe("Corn");
  });
});
