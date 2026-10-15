import { describe, expect, it } from "vitest";
import { benchmarkScore, statusFor, healthScore, financialRatios, type Ratios } from "./ratios.js";
import { balanceSheetAt, incomeStatement } from "./statements.js";

describe("benchmarkScore", () => {
  it("maps weak/strong/floor to 50/100/0", () => {
    expect(benchmarkScore(2.5, 1.3, 2.0, 0.8)).toBe(100);
    expect(benchmarkScore(1.3, 1.3, 2.0, 0.8)).toBe(50);
    expect(benchmarkScore(0.5, 1.3, 2.0, 0.8)).toBe(0);
    expect(benchmarkScore(1.65, 1.3, 2.0, 0.8)).toBeCloseTo(75);
  });
  it("supports lower-is-better ratios", () => {
    expect(benchmarkScore(0.2, 0.6, 0.3, 0.9, true)).toBe(100);
    expect(benchmarkScore(0.6, 0.6, 0.3, 0.9, true)).toBe(50);
    expect(benchmarkScore(0.95, 0.6, 0.3, 0.9, true)).toBe(0);
  });
  it("labels scores", () => {
    expect([statusFor(85), statusFor(65), statusFor(45), statusFor(20)]).toEqual(["Strong", "Healthy", "Watch", "Weak"]);
  });
});

describe("financialRatios", () => {
  const D = (s: string) => new Date(`${s}T00:00:00Z`);
  const inputs = {
    rows: [
      { date: D("2023-06-01"), cashDate: D("2023-06-01"), amountCents: 1000_00n, cashEffectCents: 1000_00n, section: "REV", accountCode: "4010" },
      { date: D("2023-06-02"), cashDate: D("2023-06-02"), amountCents: -400_00n, cashEffectCents: -400_00n, section: "COP", accountCode: "5010" },
    ],
    inventory: [], assets: [], loans: [],
    opening: { asOf: D("2022-12-31"), cashCents: 1000_00n, contributedCents: 1000_00n, retainedCents: 0n, operatingLineCents: 0n },
  };
  const end = D("2023-12-31"), start = D("2022-12-31");
  const r = financialRatios({
    is: incomeStatement(inputs.rows, start, end), start: balanceSheetAt(inputs, start), end: balanceSheetAt(inputs, end), days: 365,
    annualizeWorkingCapital: false, ownerLaborCents: 100_00n, withdrawalsCents: 0n, contributionsCents: 0n,
    termInterestPaidCents: 0n, termPrincipalPaidCents: 0n, scheduledTermPaymentsCents: 0n,
  });
  it("computes FFSC returns net of owner labor", () => {
    // (NFI 600 + interest 0 - labor 100) / avg assets (1000 + 1600) / 2
    expect(r.returnOnAssetsCost).toBeCloseTo(500 / 1300);
    expect(r.operatingExpenseRatio).toBeCloseTo(0.4);
    expect(r.termDebtCoverage).toBeNull();
  });
  it("scores repayment as strong with no term debt", () => {
    const h = healthScore(r as Ratios, false);
    expect(h.categories.find((c) => c.key === "repayment")!.score).toBe(100);
    expect(h.overall).toBeGreaterThan(0);
  });
});
