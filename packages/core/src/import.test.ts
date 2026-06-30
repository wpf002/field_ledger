import { describe, it, expect } from "vitest";
import {
  parseCsv, csvToTable, parseOfx, normalizeDate, dedupeHash,
  inferScheduleFCode, buildPreview, normalizeDesc,
} from "./import.js";

describe("CSV parsing", () => {
  it("handles quoted fields, embedded commas and escaped quotes", () => {
    const t = csvToTable('Date,Description,Amount\n2026-03-14,"Sold cattle, 5 head",6730.65\n2026-03-13,"Feed ""cube""",-500');
    expect(t.headers).toEqual(["Date", "Description", "Amount"]);
    expect(t.rows[0]).toEqual(["2026-03-14", "Sold cattle, 5 head", "6730.65"]);
    expect(t.rows[1]![1]).toBe('Feed "cube"');
  });
  it("skips blank trailing lines", () => {
    expect(parseCsv("a,b\n1,2\n\n").length).toBe(2);
  });
});

describe("OFX parsing", () => {
  it("extracts STMTTRN blocks with FITID", () => {
    const ofx = `<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260309120000<TRNAMT>-450.00<FITID>X1<NAME>Diesel Co</STMTTRN>`;
    const rows = parseOfx(ofx);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ date: "2026-03-09", amount: "-450.00", externalId: "X1", description: "Diesel Co" });
  });
});

describe("date normalization", () => {
  it("coerces common formats to ISO", () => {
    expect(normalizeDate("03/14/2026")).toBe("2026-03-14");
    expect(normalizeDate("3/4/26")).toBe("2026-03-04");
    expect(normalizeDate("2026-03-14T00:00:00Z")).toBe("2026-03-14");
  });
});

describe("Schedule F inference (every row maps)", () => {
  it("maps expenses by keyword", () => {
    expect(inferScheduleFCode("Diesel for tractors", false)).toBe("fuel");
    expect(inferScheduleFCode("Fall vaccinations", false)).toBe("veterinary");
    expect(inferScheduleFCode("Mixed cube feed", false)).toBe("feed");
  });
  it("maps income by keyword", () => {
    expect(inferScheduleFCode("Sold 5 head of cattle at auction", true)).toBe("livestock_sales_raised");
    expect(inferScheduleFCode("Soybean harvest batch 1", true)).toBe("crop_sales");
  });
  it("falls back to catch-all so nothing is unmapped", () => {
    expect(inferScheduleFCode("Misc thing", false)).toBe("other_expense");
    expect(inferScheduleFCode("Random deposit", true)).toBe("other_income");
  });
});

describe("dedupe + preview", () => {
  it("hash is stable and normalization-insensitive", () => {
    expect(dedupeHash("2026-03-14", -45000n, "Diesel  for Tractors!")).toBe(dedupeHash("2026-03-14", -45000n, "diesel for tractors"));
    expect(normalizeDesc("Diesel  for Tractors!")).toBe("diesel for tractors");
  });
  it("flags duplicates against the ledger and within the file", () => {
    const existing = { hashes: new Set([dedupeHash("2026-03-14", -45000n, "Diesel")]), externalIds: new Set<string>() };
    const rows = [
      { date: "03/14/2026", description: "Diesel", amount: "-450" },     // dup vs ledger
      { date: "03/15/2026", description: "Feed", amount: "-500" },       // new
      { date: "03/15/2026", description: "Feed", amount: "-500" },       // dup within file
    ];
    const preview = buildPreview(rows, existing);
    expect(preview.map((p) => p.duplicate)).toEqual([true, false, true]);
    expect(preview[1]!.accountCode).toBe("feed");
    expect(preview[0]!.amountCents).toBe("-45000");
  });
});
