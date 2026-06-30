import { describe, it, expect } from "vitest";
import { evaluateAlerts, mergeSettings, DEFAULT_ALERT_SETTINGS, type AlertInputs } from "./alerts.js";

const today = new Date("2026-06-30T00:00:00Z");

const base: AlertInputs = {
  liabilities: [{ id: "loan1", name: "Tractor Loan", nextPaymentAt: new Date("2026-11-30"), paymentCents: 250_000n }],
  leases: [
    { id: "exp", name: "River Bottom Fields", type: "CASH_RENT", termEnd: new Date("2025-12-31"), nextPaymentAt: null, annualRentCents: 4_500_000n },
    { id: "act", name: "Bottomland Tract", type: "CASH_RENT", termEnd: new Date("2028-12-31"), nextPaymentAt: new Date("2026-07-15"), annualRentCents: 4_500_000n },
  ],
  invoices: [
    { id: "inv2", number: "INV-2024-002", status: "SENT", dueAt: new Date("2025-01-14"), totalCents: 48_375n, customerName: "Green Valley" },
    { id: "inv1", number: "INV-2024-001", status: "PAID", dueAt: new Date("2024-12-30"), totalCents: 6_000_000n },
  ],
  budgetActuals: [{ id: "b1", label: "Feed", budgetCents: 200_000n, actualCents: 250_000n }],
};

describe("alerts engine", () => {
  it("flags expired leases, overdue invoices, due payments, and budget overage", () => {
    const a = evaluateAlerts(base, today);
    const byType = (t: string) => a.filter((x) => x.type === t);
    expect(byType("lease_expiring").map((x) => x.entityId)).toEqual(["exp"]); // active lease not flagged
    expect(byType("lease_expiring")[0]!.severity).toBe("WARNING");
    expect(byType("invoice_overdue").map((x) => x.entityId)).toEqual(["inv2"]); // PAID excluded
    expect(byType("invoice_overdue")[0]!.severity).toBe("CRITICAL");
    expect(byType("payment_due").map((x) => x.entityId)).toEqual(["act"]); // rent due Jul 15 (<30d); loan Nov 30 outside
    expect(byType("budget_over").map((x) => x.entityId)).toEqual(["b1"]);
  });

  it("sorts CRITICAL before WARNING before INFO", () => {
    const sev = evaluateAlerts(base, today).map((x) => x.severity);
    expect(sev[0]).toBe("CRITICAL");
    expect(sev.indexOf("WARNING")).toBeLessThan(sev.lastIndexOf("INFO") === -1 ? 99 : sev.lastIndexOf("INFO") + 1);
  });

  it("respects disabled rules and stable keys for dismissal", () => {
    const settings = mergeSettings([{ type: "invoice_overdue", enabled: false, leadDays: 0 }]);
    const a = evaluateAlerts(base, today, settings);
    expect(a.some((x) => x.type === "invoice_overdue")).toBe(false);
    expect(evaluateAlerts(base, today)[0]!.key).toBe("invoice_overdue:inv2");
  });

  it("merge keeps defaults for unset rules", () => {
    const m = mergeSettings([{ type: "lease_expiring", enabled: false, leadDays: 90 }]);
    expect(m.lease_expiring).toEqual({ enabled: false, leadDays: 90 });
    expect(m.payment_due).toEqual(DEFAULT_ALERT_SETTINGS.payment_due);
  });
});
