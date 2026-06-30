/**
 * Phase 3 obligations engine (pure, integer cents):
 *  - amortization schedules (payment split into interest + principal)
 *  - forward-looking obligations within a window (loans + active cash leases)
 *
 * Drives Insights "Upcoming Obligations" and the auto-post payment flow. Because
 * everything is derived from the loan/lease records, editing a record updates
 * obligations with no manual edits.
 */

export type Freq = "monthly" | "quarterly" | "semiannual" | "annual";
export const PERIODS_PER_YEAR: Record<Freq, number> = { monthly: 12, quarterly: 4, semiannual: 2, annual: 1 };
const MONTHS_PER_PERIOD: Record<Freq, number> = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 };
const asFreq = (s: string): Freq => (s in PERIODS_PER_YEAR ? (s as Freq) : "monthly");

/** Add whole months in UTC, clamping to the last valid day (Jan 31 +1mo -> Feb 28). */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}
export const addPeriod = (date: Date, freq: Freq) => addMonths(date, MONTHS_PER_PERIOD[freq]);

/** Interest accrued for one period: balance × annualRate% ÷ periodsPerYear, to the nearest cent. */
export function interestForPeriod(balanceCents: bigint, annualRatePct: number, freq: Freq): bigint {
  const bp = BigInt(Math.round(annualRatePct * 100)); // basis points
  const denom = 10_000n * BigInt(PERIODS_PER_YEAR[freq]);
  return (balanceCents * bp + denom / 2n) / denom;
}

export type ScheduleRow = {
  period: number;
  dueDate: Date;
  paymentCents: bigint;
  interestCents: bigint;
  principalCents: bigint;
  balanceAfterCents: bigint;
};

export type LoanTerms = { balanceCents: bigint; annualRatePct: number; paymentCents: bigint; firstDueDate: Date; freq: Freq };

/** Full amortization schedule until the balance reaches zero (or maxPeriods). */
export function amortizationSchedule(loan: LoanTerms, maxPeriods = 600): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  let balance = loan.balanceCents;
  let due = loan.firstDueDate;
  for (let n = 1; n <= maxPeriods && balance > 0n; n++) {
    const interestCents = interestForPeriod(balance, loan.annualRatePct, loan.freq);
    let paymentCents = loan.paymentCents;
    let principalCents = paymentCents - interestCents;
    if (principalCents <= 0n) {
      // Payment doesn't cover interest — record an interest-only row and stop.
      rows.push({ period: n, dueDate: due, paymentCents: interestCents, interestCents, principalCents: 0n, balanceAfterCents: balance });
      break;
    }
    if (principalCents >= balance) { principalCents = balance; paymentCents = balance + interestCents; } // final payment
    balance -= principalCents;
    rows.push({ period: n, dueDate: due, paymentCents, interestCents, principalCents, balanceAfterCents: balance });
    due = addPeriod(due, loan.freq);
  }
  return rows;
}

/** The next scheduled payment's interest/principal split for a liability. */
export function nextPaymentSplit(loan: { balanceCents: bigint; ratePct: number; paymentCents: bigint; nextPaymentAt: Date; paymentFreq: string }): ScheduleRow | null {
  const sched = amortizationSchedule({ balanceCents: loan.balanceCents, annualRatePct: loan.ratePct, paymentCents: loan.paymentCents, firstDueDate: loan.nextPaymentAt, freq: asFreq(loan.paymentFreq) }, 1);
  return sched[0] ?? null;
}

export type LiabilityLike = { id: string; name: string; balanceCents: bigint; ratePct: number; paymentCents: bigint | null; nextPaymentAt: Date | null; paymentFreq: string };
export type LeaseLike = { id: string; name: string; type: string; annualRentCents: bigint | null; termStart: Date; termEnd: Date };

export type Obligations = {
  windowDays: number;
  loanPaymentsCents: bigint;
  leasePaymentsCents: bigint;
  totalCents: bigint;
  loanItems: { id: string; name: string; dueDate: Date; paymentCents: bigint; interestCents: bigint; principalCents: bigint }[];
  leaseItems: { id: string; name: string; amountCents: bigint }[];
};

/** Obligations due within `days` of `today`: scheduled loan payments that fall
 *  in the window, plus prorated rent for leases active during the window. */
export function obligationsInWindow(liabilities: LiabilityLike[], leases: LeaseLike[], today: Date, days: number): Obligations {
  const end = new Date(today.getTime());
  end.setUTCDate(end.getUTCDate() + days);

  const loanItems: Obligations["loanItems"] = [];
  let loanPaymentsCents = 0n;
  for (const l of liabilities) {
    if (!l.nextPaymentAt || l.paymentCents == null) continue;
    const sched = amortizationSchedule({ balanceCents: l.balanceCents, annualRatePct: Number(l.ratePct), paymentCents: l.paymentCents, firstDueDate: l.nextPaymentAt, freq: asFreq(l.paymentFreq) });
    for (const row of sched) {
      if (row.dueDate > end) break;
      if (row.dueDate >= today) {
        loanItems.push({ id: l.id, name: l.name, dueDate: row.dueDate, paymentCents: row.paymentCents, interestCents: row.interestCents, principalCents: row.principalCents });
        loanPaymentsCents += row.paymentCents;
      }
    }
  }

  const leaseItems: Obligations["leaseItems"] = [];
  let leasePaymentsCents = 0n;
  for (const ls of leases) {
    if (ls.type !== "CASH_RENT" || ls.annualRentCents == null) continue;
    const active = ls.termStart <= end && ls.termEnd >= today; // overlaps the window
    if (!active) continue;
    const prorated = (ls.annualRentCents * BigInt(days)) / 365n;
    leaseItems.push({ id: ls.id, name: ls.name, amountCents: prorated });
    leasePaymentsCents += prorated;
  }

  return { windowDays: days, loanPaymentsCents, leasePaymentsCents, totalCents: loanPaymentsCents + leasePaymentsCents, loanItems, leaseItems };
}
