import { describe, expect, it } from "vitest";
import { balanceSheetAt, incomeStatement, netBookValue, currentPortion, monthEnds, type BalanceSheetInputs, type StatementRow } from "./statements.js";

const D = (s: string) => new Date(`${s}T00:00:00Z`);
const row = (p: Partial<StatementRow> & Pick<StatementRow, "date" | "section" | "amountCents">): StatementRow => ({
  cashDate: null, cashEffectCents: null, accountCode: "x", paymentMethod: null, ...p,
});

const inputs = (rows: StatementRow[]): BalanceSheetInputs => ({
  rows, inventory: [], assets: [], loans: [],
  opening: { asOf: D("2022-12-31"), cashCents: 100_00n, contributedCents: 100_00n, retainedCents: 0n, operatingLineCents: 0n },
});

describe("accrual working capital", () => {
  const rows = [
    // earned in Jan, collected in Feb -> AR at Jan 31
    row({ date: D("2023-01-20"), cashDate: D("2023-02-05"), section: "REV", amountCents: 500_00n, cashEffectCents: 500_00n }),
    // deposit collected in Jan for a March delivery -> customer deposit at Jan 31
    row({ date: D("2023-03-10"), cashDate: D("2023-01-15"), section: "REV", amountCents: 200_00n, cashEffectCents: 200_00n }),
    // feed incurred in Jan on a vendor account, paid in Feb -> AP
    row({ date: D("2023-01-25"), cashDate: D("2023-02-10"), section: "COP", amountCents: -80_00n, cashEffectCents: -80_00n, paymentMethod: "Vendor account" }),
    // card charge -> credit cards
    row({ date: D("2023-01-28"), cashDate: D("2023-02-20"), section: "COP", amountCents: -30_00n, cashEffectCents: -30_00n, paymentMethod: "Credit card" }),
    // seed prepaid in Jan, used in April -> prepaid
    row({ date: D("2023-04-01"), cashDate: D("2023-01-05"), section: "COP", amountCents: -60_00n, cashEffectCents: -60_00n }),
  ];
  const bs = balanceSheetAt(inputs(rows), D("2023-01-31"));

  it("derives each line from the two dates", () => {
    expect(bs.arCents).toBe(500_00n);
    expect(bs.customerDepositsCents).toBe(200_00n);
    expect(bs.apCents).toBe(80_00n);
    expect(bs.creditCardsCents).toBe(30_00n);
    expect(bs.prepaidCents).toBe(60_00n);
    expect(bs.cashCents).toBe(100_00n + 200_00n - 60_00n);
  });

  it("balances", () => {
    expect(bs.balanceCheckCents).toBe(0n);
    for (const m of monthEnds(D("2023-01-01"), D("2023-06-30"))) expect(balanceSheetAt(inputs(rows), m).balanceCheckCents).toBe(0n);
  });
});

describe("income statement", () => {
  it("rolls sections into net farm income", () => {
    const is = incomeStatement([
      row({ date: D("2023-01-10"), section: "REV", amountCents: 1000_00n }),
      row({ date: D("2023-01-11"), section: "COP", amountCents: -400_00n }),
      row({ date: D("2023-01-12"), section: "OVH", amountCents: -100_00n }),
      row({ date: D("2023-01-31"), section: "DEP", amountCents: -50_00n }),
      row({ date: D("2023-01-15"), section: "INT", amountCents: -20_00n }),
      row({ date: D("2023-01-31"), section: "INVCHG", amountCents: 30_00n }),
      row({ date: D("2023-01-31"), section: "LVCHG", amountCents: -10_00n }),
    ], D("2022-12-31"), D("2023-01-31"));
    expect(is.grossProfitCents).toBe(600_00n);
    expect(is.ebitdaCents).toBe(500_00n);
    expect(is.netIncomeOperatingCents).toBe(430_00n);
    expect(is.netFarmIncomeCents).toBe(450_00n);
  });
});

describe("fixed assets and loans", () => {
  it("counts the purchase month and rounds half-to-even", () => {
    // 615.00 - 415.00 * 21 / 96 = 524.21875 -> 524.22
    const a = { category: "Vehicles", purchasedAt: D("2021-06-10"), originalCostCents: 615_00n, salvageCents: 200_00n, usefulLifeYears: 8, disposedAt: null };
    expect(netBookValue(a, D("2023-02-28"))).toBe(524_22n);
  });
  it("current portion is principal due within a year", () => {
    const loan = { id: "l", debtType: "Land loan", isLine: false, originatedAt: D("2020-01-01"), originalCents: 1000n,
      schedule: [{ dueDate: D("2023-06-01"), principalCents: 100n, endingBalanceCents: 900n }, { dueDate: D("2024-06-01"), principalCents: 100n, endingBalanceCents: 800n }] };
    expect(currentPortion(loan, D("2023-01-31"))).toBe(100n);
  });
});
