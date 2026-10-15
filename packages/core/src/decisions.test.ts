import { describe, expect, it } from "vitest";
import { loanPayment, equipmentPurchase, repairVsReplace, priceShock, costShock, leaseVsProduce, variance, priceVolume, sellOrHold } from "./decisions.js";

describe("loanPayment", () => {
  it("matches a standard annuity", () => {
    // $150k, 5 years, 7.25% annual -> ~$36,828.80
    expect(Number(loanPayment(150_000_00n, 7.25, 5)) / 100).toBeCloseTo(36_828.8, 0);
  });
});

describe("equipmentPurchase", () => {
  it("nets the new payment against repayment margin", () => {
    const r = equipmentPurchase({ priceCents: 150_000_00n, downPaymentCents: 0n, ratePct: 7.25, years: 5, repaymentMarginCents: 86_682_62n });
    expect(Number(r.marginAfterCents) / 100).toBeCloseTo(49_853.8, -1);
    expect(r.affordable).toBe(true);
  });
});

describe("repairVsReplace", () => {
  it("picks the cheapest path over the horizon", () => {
    const r = repairVsReplace({
      horizonYears: 5, currentRepairsCents: 40_000_00n, repairGrowthPct: 0.15, currentNotePaymentCents: 0n, currentNoteYearsLeft: 0, currentResaleCents: 0n,
      overhaulCents: 30_000_00n, repairsAfterOverhaulCents: 15_000_00n,
      replacementPriceCents: 300_000_00n, tradeInCents: 150_000_00n, ratePct: 7, termYears: 7, newRepairsCents: 5_000_00n, resaleAtEndCents: 0n,
    });
    expect(r.best.key).toBe("repair");
    expect(r.options.find((o) => o.key === "keep")!.totalCents).toBeGreaterThan(r.options.find((o) => o.key === "repair")!.totalCents);
  });
});

describe("levers", () => {
  it("computes shocks, leases, and variance direction", () => {
    expect(priceShock(386_916_00n, -0.15).impactCents).toBe(-58_037_40n);
    expect(costShock(28_491_20n, 0.2).impactCents).toBe(-5_698_24n);
    expect(Number(leaseVsProduce({ acres: 110, rentPerAcre: 35, savedCostPerAcre: 3.8, marginPerAcre: 102.58 }).impactCents) / 100).toBeCloseTo(-7015.8, 1);
    expect(variance("Feed", 100_00n, 117_00n, "expense").favorable).toBe(false);
    expect(variance("Sales", 100_00n, 117_00n, "revenue").favorable).toBe(true);
  });
  it("splits a revenue change into price and volume", () => {
    const pv = priceVolume([{ quantity: 100, amountCents: 1000_00n }], [{ quantity: 110, amountCents: 1210_00n }])!;
    expect(pv.volumePct).toBeCloseTo(0.1);
    expect(pv.pricePct).toBeCloseTo(0.1);
    expect(pv.volumeCents + pv.priceCents).toBe(210_00n);
  });
});

describe("sell or hold", () => {
  it("holding pays only above the carry break-even", () => {
    const r = sellOrHold({ quantity: 10000, priceNow: 4.0, priceLater: 4.5, months: 5, storagePerUnitMonth: 0.03, interestPct: 8, shrinkPct: 0.01 });
    expect(r.sellNowCents).toBe(4_000_000n);
    expect(r.storageCents).toBe(150_000n);
    expect(r.interestCents).toBe(133_333n);
    expect(r.breakEvenPrice).toBeCloseTo((40000 + 1500 + 1333.33) / 9900, 3);
    expect(r.better).toBe("hold");
    expect(sellOrHold({ quantity: 10000, priceNow: 4.0, priceLater: 4.1, months: 5, storagePerUnitMonth: 0.03, interestPct: 8, shrinkPct: 0.01 }).better).toBe("sell");
  });
});
