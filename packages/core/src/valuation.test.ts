import { describe, it, expect } from "vitest";
import { straightLineDepreciation, unitsTimesPrice, valueInventoryItem, taxBasisCents, latestPriceCents } from "./valuation.js";

describe("straight-line depreciation", () => {
  it("prorates by days and floors at salvage", () => {
    // $150,000 cost, $30,000 salvage, 10yr -> $12,000/yr. 5 years elapsed.
    const acquired = new Date("2021-06-30T00:00:00Z");
    const asOf = new Date("2026-06-30T00:00:00Z"); // ~1826 days
    const d = straightLineDepreciation(15_000_000n, 3_000_000n, 10, acquired, asOf);
    expect(d.annualCents).toBe(1_200_000n);
    // ~5 years elapsed -> ~$60,000 accumulated; exact value depends on leap days.
    expect(Number(d.accumulatedCents)).toBeGreaterThan(5_990_000);
    expect(Number(d.accumulatedCents)).toBeLessThan(6_010_000);
    expect(d.bookValueCents).toBe(15_000_000n - d.accumulatedCents);
  });
  it("never depreciates below salvage", () => {
    const d = straightLineDepreciation(10_000_000n, 2_000_000n, 5, new Date("2000-01-01"), new Date("2030-01-01"));
    expect(d.bookValueCents).toBe(2_000_000n); // fully depreciated to salvage
  });
});

describe("mark-to-market", () => {
  it("multiplies qty by price with cent rounding", () => {
    expect(unitsTimesPrice(180_000n, 45)).toBe(8_100_000n);     // 45 head @ $1800
    expect(unitsTimesPrice(1_400n, 5000)).toBe(7_000_000n);     // 5000 bu @ $14
    expect(unitsTimesPrice(1_333n, 1.5)).toBe(2_000n);          // rounds to nearest cent
  });
  it("prefers manual override over market price", () => {
    const v = valueInventoryItem({ category: "CROPS", quantity: 100, unitValueCents: 1_500n }, 1_400n, new Date());
    expect(v.source).toBe("override");
    expect(v.valueCents).toBe(150_000n);
  });
  it("uses market price when no override", () => {
    const v = valueInventoryItem({ category: "LIVESTOCK", quantity: 45, basisType: "RAISED" }, 180_000n, new Date());
    expect(v.source).toBe("market");
    expect(v.valueCents).toBe(8_100_000n);
    expect(v.marketable).toBe(true);
  });
  it("equipment uses depreciated book value", () => {
    const v = valueInventoryItem(
      { category: "EQUIPMENT", quantity: 1, costBasisCents: 15_000_000n, salvageCents: 3_000_000n, usefulLifeYears: 10, acquiredAt: "2021-06-30T00:00:00Z" },
      null, new Date("2026-06-30T00:00:00Z"),
    );
    expect(v.source).toBe("depreciated");
    expect(v.marketable).toBe(false);
    expect(v.valueCents).toBe(v.depreciation!.bookValueCents);
  });
});

describe("tax basis", () => {
  it("raised is zero, purchased carries cost", () => {
    expect(taxBasisCents({ category: "LIVESTOCK", quantity: 1, basisType: "RAISED", costBasisCents: 999n })).toBe(0n);
    expect(taxBasisCents({ category: "LIVESTOCK", quantity: 1, basisType: "PURCHASED", costBasisCents: 120_000n })).toBe(120_000n);
  });
});

describe("latest price", () => {
  it("returns the newest quote for a symbol", () => {
    const prices = [
      { symbol: "ZW=F", priceCents: 1_300n, asOf: "2026-01-01" },
      { symbol: "ZW=F", priceCents: 1_400n, asOf: "2026-06-01" },
      { symbol: "LE=F", priceCents: 180_000n, asOf: "2026-06-01" },
    ];
    expect(latestPriceCents(prices, "ZW=F")).toBe(1_400n);
    expect(latestPriceCents(prices, "XX=F")).toBe(null);
  });
});
