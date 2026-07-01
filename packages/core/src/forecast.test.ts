import { describe, it, expect } from "vitest";
import { naiveForecaster, makeHoltWintersForecaster, holtWintersForecaster, type MonthFlow } from "./forecast.js";

const flows = (income: number[], expense: number[] = []): MonthFlow[] =>
  income.map((inc, i) => ({ month: `m${i}`, incomeCents: BigInt(inc), expenseCents: BigInt(expense[i] ?? 0) }));

describe("naive forecaster (Prophet seam)", () => {
  it("spreads window totals evenly across projected months", () => {
    const history: MonthFlow[] = [{ month: "Jun", incomeCents: 100n, expenseCents: 50n }];
    const out = naiveForecaster.project(history, ["Jul", "Aug", "Sep"], 15_000_000n, 1_500_000n);
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({ month: "Jul", incomeCents: 5_000_000n, expenseCents: 500_000n });
    expect(out.every((p) => p.incomeCents === 5_000_000n)).toBe(true);
  });
});

describe("holt-winters forecaster", () => {
  it("extrapolates a linear trend from history", () => {
    // alpha=beta=1, phi=1 → exact linear fit: [100,200,300,400] continues by +100.
    const hw = makeHoltWintersForecaster({ alpha: 1, beta: 1, phi: 1 });
    const out = hw.project(flows([100, 200, 300, 400]), ["Jul", "Aug", "Sep"], 0n, 0n);
    expect(out.map((p) => p.incomeCents)).toEqual([500n, 600n, 700n]);
    expect(out.every((p) => p.expenseCents === 0n)).toBe(true); // flat zero expense series
  });

  it("recovers a seasonal pattern once ≥2 seasons are present", () => {
    // seasonLength 2, pattern [0,100] repeated 3× → forecast reproduces [0,100,0].
    const hw = makeHoltWintersForecaster({ seasonLength: 2 });
    const out = hw.project(flows([0, 100, 0, 100, 0, 100]), ["Jul", "Aug", "Sep"], 0n, 0n);
    expect(out.map((p) => p.incomeCents)).toEqual([0n, 100n, 0n]);
  });

  it("never forecasts negative flows (clamped at zero)", () => {
    const hw = makeHoltWintersForecaster({ alpha: 1, beta: 1, phi: 1 });
    const out = hw.project(flows([1000, 500, 100]), ["Jul", "Aug"], 0n, 0n); // steep decline
    expect(out.every((p) => p.incomeCents >= 0n)).toBe(true);
    expect(out[0]!.incomeCents).toBe(0n);
  });

  it("falls back to the grounded even spread when history is too short", () => {
    const out = holtWintersForecaster.project(flows([100]), ["Jul", "Aug"], 1000n, 400n);
    expect(out).toEqual(naiveForecaster.project(flows([100]), ["Jul", "Aug"], 1000n, 400n));
  });

  it("returns integer cents (bigint)", () => {
    const out = holtWintersForecaster.project(flows([10, 15, 21]), ["Jul"], 0n, 0n);
    expect(typeof out[0]!.incomeCents).toBe("bigint");
  });
});
