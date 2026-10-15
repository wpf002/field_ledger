import { describe, expect, it } from "vitest";
import { rollCash, openItemFlows, scheduledDebtFlows, operatingPlanFlows, mape, type CashItem } from "./cashforecast.js";
import type { StatementRow } from "./statements.js";

const D = (s: string) => new Date(`${s}T00:00:00Z`);

describe("rollCash", () => {
  const periods = [{ start: D("2026-09-30"), end: D("2026-10-07") }, { start: D("2026-10-07"), end: D("2026-10-14") }];
  it("draws on the line to hold the reserve and repays in $1,000s", () => {
    const items: CashItem[] = [
      { date: D("2026-10-02"), group: "Feed", source: "operating plan", description: "", cents: -30_000_00n },
      { date: D("2026-10-10"), group: "Sales", source: "operating plan", description: "", cents: 50_000_00n },
    ];
    const [w1, w2] = rollCash(items, periods, 20_000_00n, { limitCents: 100_000_00n, ratePct: 0, balanceCents: 0n }, 10_000_00n, () => 0n);
    expect(w1!.drawsCents).toBe(20_000_00n);
    expect(w1!.endingCashCents).toBe(10_000_00n);
    expect(w2!.repaymentsCents).toBe(20_000_00n);
    expect(w2!.lineBalanceCents).toBe(0n);
  });
});

describe("known items", () => {
  it("takes open invoices/bills on their expected dates and splits loan payments", () => {
    const rows = [
      { date: D("2026-09-20"), cashDate: null, expectedCashDate: D("2026-10-05"), amountCents: 500_00n, cashEffectCents: null, section: "REV", accountCode: "4010" },
      { date: D("2026-09-21"), cashDate: null, expectedCashDate: D("2027-03-01"), amountCents: -80_00n, cashEffectCents: null, section: "COP", accountCode: "5070" },
    ] as (StatementRow & { expectedCashDate: Date | null })[];
    expect(openItemFlows(rows, D("2026-09-30"), D("2026-12-30")).map((i) => i.cents)).toEqual([500_00n]);
    const loan = { id: "l", isLine: false, debtType: "Land loan", originatedAt: null, originalCents: 0n, schedule: [{ dueDate: D("2026-11-01"), paymentCents: 1000_00n, principalCents: 700_00n, endingBalanceCents: 0n }] };
    expect(scheduledDebtFlows([loan], D("2026-09-30"), D("2026-12-30")).map((i) => i.cents)).toEqual([-300_00n, -700_00n]);
  });
  it("plans from last year's flows, skipping receivable run-off", () => {
    const rows: StatementRow[] = [
      { date: D("2025-10-10"), cashDate: D("2025-10-20"), amountCents: 100_00n, cashEffectCents: 100_00n, section: "REV", accountCode: "4010", cashFlowClass: "Customer collections" },
      { date: D("2025-09-15"), cashDate: D("2025-10-05"), amountCents: 999_00n, cashEffectCents: 999_00n, section: "REV", accountCode: "4010", cashFlowClass: "Customer collections" },
    ];
    const plan = operatingPlanFlows(rows, D("2026-09-30"), D("2026-12-30"), { pricePct: 0.1, volumePct: 0, costInflationPct: 0 });
    expect(plan.map((p) => p.cents)).toEqual([110_00n]);
  });
  it("mape ignores zero actuals", () => {
    expect(mape([{ forecast: 110n, actual: 100n }, { forecast: 5n, actual: 0n }])).toBeCloseTo(0.1);
  });
});
