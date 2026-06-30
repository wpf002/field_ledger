import { describe, it, expect } from "vitest";
import { naiveForecaster, type MonthFlow } from "./forecast.js";

describe("naive forecaster (Prophet seam)", () => {
  it("spreads window totals evenly across projected months", () => {
    const history: MonthFlow[] = [{ month: "Jun", incomeCents: 100n, expenseCents: 50n }];
    const out = naiveForecaster.project(history, ["Jul", "Aug", "Sep"], 15_000_000n, 1_500_000n);
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({ month: "Jul", incomeCents: 5_000_000n, expenseCents: 500_000n });
    expect(out.every((p) => p.incomeCents === 5_000_000n)).toBe(true);
  });
});
