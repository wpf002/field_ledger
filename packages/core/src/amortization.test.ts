import { describe, it, expect } from "vitest";
import { addMonths, interestForPeriod, amortizationSchedule, nextPaymentSplit, obligationsInWindow } from "./amortization.js";

describe("date math", () => {
  it("adds months, clamping to month end", () => {
    expect(addMonths(new Date("2026-01-31T00:00:00Z"), 1).toISOString().slice(0, 10)).toBe("2026-02-28");
    expect(addMonths(new Date("2026-11-30T00:00:00Z"), 1).toISOString().slice(0, 10)).toBe("2026-12-30");
  });
});

describe("amortization", () => {
  it("splits a payment into interest and principal", () => {
    // $150,000 @ 6.5% monthly -> interest = 150000*0.065/12 = $812.50
    const i = interestForPeriod(15_000_000n, 6.5, "monthly");
    expect(i).toBe(81_250n);
    const sched = amortizationSchedule({ balanceCents: 15_000_000n, annualRatePct: 6.5, paymentCents: 250_000n, firstDueDate: new Date("2026-11-30T00:00:00Z"), freq: "monthly" }, 3);
    expect(sched[0]!.interestCents).toBe(81_250n);
    expect(sched[0]!.principalCents).toBe(250_000n - 81_250n);            // 168,750
    expect(sched[0]!.balanceAfterCents).toBe(15_000_000n - 168_750n);
    // balance strictly decreases
    expect(sched[1]!.balanceAfterCents < sched[0]!.balanceAfterCents).toBe(true);
  });

  it("fully amortizes to a zero balance with a final partial payment", () => {
    const sched = amortizationSchedule({ balanceCents: 100_000n, annualRatePct: 6, paymentCents: 20_000n, firstDueDate: new Date("2026-01-01T00:00:00Z"), freq: "monthly" });
    expect(sched.at(-1)!.balanceAfterCents).toBe(0n);
    expect(sched.at(-1)!.paymentCents <= 20_000n).toBe(true);
  });

  it("nextPaymentSplit returns the first row", () => {
    const r = nextPaymentSplit({ balanceCents: 7_500_000n, ratePct: 7.2, paymentCents: 150_000n, nextPaymentAt: new Date("2027-01-14T00:00:00Z"), paymentFreq: "monthly" });
    expect(r!.interestCents).toBe(45_000n); // 7,500,000 * 7.2% / 12
    expect(r!.principalCents).toBe(105_000n);
  });
});

describe("obligations window", () => {
  const today = new Date("2026-06-30T00:00:00Z");
  const liabilities = [
    { id: "a", name: "Tractor Loan", balanceCents: 15_000_000n, ratePct: 6.5, paymentCents: 250_000n, nextPaymentAt: new Date("2026-11-30T00:00:00Z"), paymentFreq: "monthly" },
  ];
  const leases = [
    { id: "x", name: "Expired", type: "CASH_RENT", annualRentCents: 4_500_000n, termStart: new Date("2022-01-01"), termEnd: new Date("2025-12-31") },
    { id: "y", name: "Active", type: "CASH_RENT", annualRentCents: 4_200_000n, termStart: new Date("2025-01-01"), termEnd: new Date("2028-12-31") },
    { id: "z", name: "Crop Share", type: "CROP_SHARE", annualRentCents: null, termStart: new Date("2025-01-01"), termEnd: new Date("2028-12-31") },
  ];

  it("excludes loan payments and expired/crop-share leases outside the window", () => {
    const o = obligationsInWindow(liabilities, leases, today, 90);
    expect(o.loanPaymentsCents).toBe(0n);                 // next loan payment is Nov 30, > 90 days out
    expect(o.leaseItems.map((l) => l.name)).toEqual(["Active"]); // expired + crop-share excluded
    expect(o.leasePaymentsCents).toBe((4_200_000n * 90n) / 365n);
  });

  it("includes a loan payment that falls in a longer window", () => {
    const o = obligationsInWindow(liabilities, leases, today, 160); // reaches ~Dec 7, catches Nov 30 only
    expect(o.loanItems.length).toBe(1);
    expect(o.loanItems[0]!.interestCents).toBe(81_250n);            // split, not just the payment
    expect(o.loanPaymentsCents).toBe(250_000n);
  });
});
