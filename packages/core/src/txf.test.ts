import { describe, it, expect } from "vitest";
import { scheduleFToTxf } from "./txf.js";
import type { ReportTxn } from "./reports.js";

const txn = (scheduleFCode: string, amountCents: bigint, year = 2025): ReportTxn => ({
  amountCents,
  date: new Date(Date.UTC(year, 5, 1)),
  account: { code: scheduleFCode, label: scheduleFCode, kind: amountCents > 0n ? "INCOME" : "EXPENSE", scheduleFCode },
});
const DATE = new Date(Date.UTC(2025, 3, 15)); // 04/15/2025

describe("scheduleFToTxf", () => {
  it("emits a v042 header with software + date", () => {
    const { txf } = scheduleFToTxf([txn("feed", -10000n)], 2025, { date: DATE });
    const lines = txf.split("\r\n");
    expect(lines.slice(0, 4)).toEqual(["V042", "AAcreflow", "D04/15/2025", "^"]);
  });

  it("groups by TXF ref with positive magnitudes; categories sharing a ref merge", () => {
    // crop_sales + livestock_sales_raised both map to ref 368.
    const { txf, mappedRefs } = scheduleFToTxf(
      [txn("crop_sales", 50000n), txn("livestock_sales_raised", 30000n), txn("feed", -10000n)],
      2025, { date: DATE },
    );
    expect(mappedRefs).toBe(2); // 368 (merged) + 350
    expect(txf).toContain("N368\r\nC1\r\nL1\r\n$800.00\r\n^"); // 500 + 300
    expect(txf).toContain("N350\r\nC1\r\nL1\r\n$100.00\r\n^"); // feed, positive magnitude
    // refs are ascending: 350 before 368
    expect(txf.indexOf("N350")).toBeLessThan(txf.indexOf("N368"));
  });

  it("reports depreciation (no Schedule F TXF code) as unmapped, not in the file", () => {
    const { txf, unmappedCents } = scheduleFToTxf([txn("depreciation", -20000n), txn("feed", -10000n)], 2025, { date: DATE });
    expect(unmappedCents).toBe(20000n);
    expect(txf).not.toContain("$200.00");
  });

  it("only includes the requested tax year", () => {
    const { txf } = scheduleFToTxf([txn("feed", -10000n, 2025), txn("feed", -99900n, 2024)], 2025, { date: DATE });
    expect(txf).toContain("$100.00");
    expect(txf).not.toContain("$999.00");
  });
});
