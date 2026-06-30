import { describe, it, expect } from "vitest";
import { profitAndLoss, scheduleFSummary, cashFlowStatement, enterpriseProfitability, centsToDecimal, toCsv, type ReportTxn } from "./reports.js";

const acct = (code: string, label: string, kind: string, scheduleFCode = code) => ({ code, label, kind, scheduleFCode });
const txns: ReportTxn[] = [
  { amountCents: 1_500_000n, date: new Date("2026-03-14"), account: acct("livestock_sales_raised", "Livestock Sales", "INCOME") },
  { amountCents: 500_000n, date: new Date("2026-04-01"), account: acct("crop_sales", "Crop Sales", "INCOME") },
  { amountCents: -50_000n, date: new Date("2026-03-13"), account: acct("feed", "Feed", "EXPENSE") },
  { amountCents: -680_000n, date: new Date("2026-04-18"), account: acct("fertilizer", "Fertilizer", "EXPENSE") },
  { amountCents: -52_000n, date: new Date("2026-02-08"), account: acct("fuel", "Fuel", "EXPENSE") },
  { amountCents: -99_999n, date: new Date("2023-11-01"), account: acct("fuel", "Fuel", "EXPENSE") }, // other year
];

describe("profit and loss", () => {
  it("sums income and expenses by category for the year", () => {
    const pl = profitAndLoss(txns, 2026);
    expect(pl.totalIncomeCents).toBe(2_000_000n);
    expect(pl.totalExpenseCents).toBe(782_000n); // 50k+680k+52k, excludes 2023
    expect(pl.netCents).toBe(1_218_000n);
    expect(pl.income[0]!.label).toBe("Livestock Sales"); // sorted desc
  });
});

describe("schedule F summary", () => {
  it("groups by Schedule F line and computes net farm profit", () => {
    const sf = scheduleFSummary(txns, 2026);
    expect(sf.netFarmProfitCents).toBe(1_218_000n);
    // livestock_sales_raised and crop_sales both map to line F-2 -> merged
    expect(sf.income.find((l) => l.line === "F-2")!.totalCents).toBe(2_000_000n);
    expect(sf.expenses.some((l) => l.label.startsWith("Gasoline"))).toBe(true);
  });
});

describe("cash flow statement", () => {
  it("nets inflow vs outflow per month", () => {
    const cf = cashFlowStatement(txns, 2026);
    expect(cf.months).toHaveLength(12);
    expect(cf.months[1]!.outflowCents).toBe(52_000n); // Feb fuel
    expect(cf.months[2]!.inflowCents).toBe(1_500_000n); // Mar cattle
    expect(cf.netCents).toBe(1_218_000n);
  });
});

describe("enterprise profitability", () => {
  it("buckets by enterprise with overhead fallback", () => {
    const ent = enterpriseProfitability(txns, 2026);
    const livestock = ent.find((e) => e.name === "Livestock")!;
    expect(livestock.incomeCents).toBe(1_500_000n);
    expect(livestock.expenseCents).toBe(50_000n);
    expect(livestock.netCents).toBe(1_450_000n);
    expect(ent.find((e) => e.name === "Overhead")!.expenseCents).toBe(52_000n); // fuel
  });
});

describe("csv", () => {
  it("formats cents as plain decimals and escapes cells", () => {
    expect(centsToDecimal(2_673_065n)).toBe("26730.65");
    expect(centsToDecimal(-50_000n)).toBe("-500.00");
    expect(toCsv([["a", "b,c"], [1, "x\"y"]])).toBe('a,"b,c"\n1,"x""y"');
  });
});
