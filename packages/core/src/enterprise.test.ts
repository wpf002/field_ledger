import { describe, expect, it } from "vitest";
import { enterpriseStatements, cropEconomics, headEconomics, yieldNeeded, priceNeeded } from "./enterprise.js";
import type { StatementRow } from "./statements.js";

const D = (s: string) => new Date(`${s}T00:00:00Z`);
const r = (p: Partial<StatementRow> & Pick<StatementRow, "section" | "amountCents">): StatementRow =>
  ({ date: D("2025-05-01"), cashDate: null, cashEffectCents: null, accountCode: "x", enterpriseId: "E", ...p });

describe("enterpriseStatements", () => {
  it("counts transfers toward each enterprise's gross profit and nets to zero", () => {
    const st = enterpriseStatements([
      r({ section: "REV", amountCents: 1000_00n, enterpriseId: "A" }),
      r({ section: "XFER", amountCents: 300_00n, enterpriseId: "A" }),
      r({ section: "XFER", amountCents: -300_00n, enterpriseId: "B" }),
      r({ section: "COP", amountCents: -200_00n, enterpriseId: "B" }),
    ], D("2024-12-31"), D("2025-12-31"));
    expect(st.get("A")!.grossProfitCents).toBe(1300_00n);
    expect(st.get("B")!.grossProfitCents).toBe(-500_00n);
  });
});

describe("cropEconomics", () => {
  it("spreads parent shared costs and enterprise depreciation by acres", () => {
    const seasons = [
      { id: "s1", enterpriseId: "TOM", parentEnterpriseId: "PRD", crop: "Tomatoes", year: 2025, acres: 1, actualYield: 1000, actualAvgPrice: 3, yieldUnit: "lb/ac" },
      { id: "s2", enterpriseId: "OKR", parentEnterpriseId: "PRD", crop: "Okra", year: 2025, acres: 3, actualYield: 500, actualAvgPrice: 4, yieldUnit: "lb/ac" },
    ];
    const rows = [
      r({ section: "REV", amountCents: 3000_00n, enterpriseId: "TOM" }),
      r({ section: "COP", amountCents: -500_00n, enterpriseId: "TOM", accountCode: "5010" }),
      r({ section: "COP", amountCents: -800_00n, enterpriseId: "PRD", accountCode: "5160" }),
    ];
    const [tom] = cropEconomics(rows, seasons, new Map([["TOM|2025", 100_00n]]));
    expect(tom!.perAcre.seed).toBe(500);
    expect(tom!.perAcre.shared).toBe(200); // 800 over 4 produce acres
    expect(tom!.perAcre.depreciation).toBe(100);
    expect(tom!.perAcre.profit).toBe(3000 - 800);
    expect(tom!.breakEvenPrice).toBeCloseTo(0.8);
  });
  it("answers break-even questions both ways", () => {
    expect(yieldNeeded(258, 6)).toBeCloseTo(43);
    expect(priceNeeded(258, 48)).toBeCloseTo(5.375);
  });
});

describe("headEconomics", () => {
  it("splits costs per head by category", () => {
    const h = headEconomics([
      r({ section: "REV", amountCents: 10000_00n }),
      r({ section: "COP", amountCents: -2000_00n, accountCode: "5070" }),
      r({ section: "COP", amountCents: -1000_00n, accountCode: "5210" }),
      r({ section: "DEP", amountCents: -500_00n }),
      r({ section: "LVCHG", amountCents: 1000_00n }),
    ], "E", D("2024-12-31"), D("2025-12-31"), 10);
    expect(h.perHead.feed).toBe(200);
    expect(h.perHead.processing).toBe(100);
    expect(h.perHead.overheadDepInterest).toBe(50);
    expect(h.perHead.profitAccrual).toBe(1000 - 350 + 100);
  });
});
