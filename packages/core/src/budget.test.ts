import { describe, it, expect } from "vitest";
import { budgetActualCents, budgetStatus, type ExpenseLike } from "./budget.js";

const today = new Date("2026-06-30T00:00:00Z"); // 6 months elapsed
const txns: ExpenseLike[] = [
  { accountCode: "feed", amountCents: -50_000n, date: new Date("2026-03-13") },
  { accountCode: "feed", amountCents: -115_000n, date: new Date("2026-05-12") },
  { accountCode: "feed", amountCents: -250_000n, date: new Date("2023-10-19") }, // wrong year
  { accountCode: "veterinary", amountCents: -115_000n, date: new Date("2026-06-21") },
  { accountCode: "crop_sales", amountCents: 500_000n, date: new Date("2026-01-01") }, // income ignored
];

describe("budget vs actual", () => {
  it("sums YTD expense for the category and year only", () => {
    expect(budgetActualCents({ id: "f", period: "ANNUAL", year: 2026, month: null, accountCode: "feed", amountCents: 0n }, txns)).toBe(165_000n);
  });

  it("annual budget compares YTD spend to the annual figure", () => {
    const s = budgetStatus({ id: "fert", period: "ANNUAL", year: 2026, month: null, accountCode: "fertilizer", amountCents: 800_000n }, [{ accountCode: "fertilizer", amountCents: -680_000n, date: new Date("2026-04-18") }], today);
    expect(s.actualCents).toBe(680_000n);
    expect(s.targetCents).toBe(800_000n);
    expect(s.pct).toBe(85);
    expect(s.over).toBe(false);
  });

  it("monthly budget prorates the target by months elapsed", () => {
    // $350/mo feed, 6 months elapsed -> target $2,100; YTD spend $1,650 -> 79%
    const s = budgetStatus({ id: "feed", period: "MONTHLY", year: 2026, month: null, accountCode: "feed", amountCents: 35_000n, label: "Feed" }, txns, today);
    expect(s.actualCents).toBe(165_000n);
    expect(s.targetCents).toBe(210_000n);
    expect(s.pct).toBe(79);
    expect(s.label).toBe("Feed");
  });

  it("flags over budget", () => {
    const s = budgetStatus({ id: "vet", period: "ANNUAL", year: 2026, month: null, accountCode: "veterinary", amountCents: 100_000n }, txns, today);
    expect(s.actualCents).toBe(115_000n);
    expect(s.over).toBe(true);
  });
});
