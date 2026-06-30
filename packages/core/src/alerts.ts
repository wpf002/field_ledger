/**
 * Phase 4 alerts engine (pure). Evaluates rules over existing dates/state and
 * returns candidate alerts with stable keys. Alerts are computed live (never
 * stale): the API filters them by per-rule settings and a dismissed-key set.
 */
import { formatCentsDisplay } from "./money.js";

export type AlertSeverity = "INFO" | "WARNING" | "CRITICAL";
export type AlertType = "payment_due" | "invoice_overdue" | "lease_expiring" | "budget_over";

export type AlertCandidate = {
  key: string;          // stable: `${type}:${entityId}` — used for dismissal
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  dueAt: string | null; // ISO date
  entityId: string;
};

export type RuleSetting = { enabled: boolean; leadDays: number };
export type AlertSettings = Record<AlertType, RuleSetting>;
export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  payment_due: { enabled: true, leadDays: 30 },
  invoice_overdue: { enabled: true, leadDays: 0 },
  lease_expiring: { enabled: true, leadDays: 60 },
  budget_over: { enabled: true, leadDays: 0 },
};

export type AlertInputs = {
  liabilities: { id: string; name: string; nextPaymentAt: Date | null; paymentCents: bigint | null }[];
  leases: { id: string; name: string; type: string; termEnd: Date; nextPaymentAt: Date | null; annualRentCents: bigint | null }[];
  invoices: { id: string; number: string; status: string; dueAt: Date; totalCents: bigint; customerName?: string }[];
  budgetActuals: { id: string; label: string; budgetCents: bigint; actualCents: bigint }[];
};

const addDays = (d: Date, n: number) => { const x = new Date(d.getTime()); x.setUTCDate(x.getUTCDate() + n); return x; };
const daysBetween = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 86_400_000);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const money = (cents: bigint) => formatCentsDisplay(cents < 0n ? -cents : cents);

/** Evaluate all enabled rules. Severity rises as the issue gets more pressing. */
export function evaluateAlerts(input: AlertInputs, today: Date, settings: AlertSettings = DEFAULT_ALERT_SETTINGS): AlertCandidate[] {
  const out: AlertCandidate[] = [];

  if (settings.payment_due.enabled) {
    const horizon = addDays(today, settings.payment_due.leadDays);
    for (const l of input.liabilities) {
      if (l.nextPaymentAt && l.nextPaymentAt >= today && l.nextPaymentAt <= horizon) {
        const d = daysBetween(l.nextPaymentAt, today);
        out.push({ key: `payment_due:${l.id}`, type: "payment_due", severity: d <= 7 ? "WARNING" : "INFO", title: `Payment due — ${l.name}`, message: `${l.paymentCents ? money(l.paymentCents) : "Payment"} due in ${d} day${d === 1 ? "" : "s"}`, dueAt: iso(l.nextPaymentAt), entityId: l.id });
      }
    }
    for (const ls of input.leases) {
      if (ls.type === "CASH_RENT" && ls.nextPaymentAt && ls.nextPaymentAt >= today && ls.nextPaymentAt <= horizon) {
        const d = daysBetween(ls.nextPaymentAt, today);
        out.push({ key: `payment_due:${ls.id}`, type: "payment_due", severity: d <= 7 ? "WARNING" : "INFO", title: `Rent due — ${ls.name}`, message: `${ls.annualRentCents ? money(ls.annualRentCents) : "Rent"} due in ${d} day${d === 1 ? "" : "s"}`, dueAt: iso(ls.nextPaymentAt), entityId: ls.id });
      }
    }
  }

  if (settings.invoice_overdue.enabled) {
    for (const inv of input.invoices) {
      if ((inv.status === "SENT" || inv.status === "OVERDUE") && inv.dueAt < today) {
        const d = daysBetween(today, inv.dueAt);
        out.push({ key: `invoice_overdue:${inv.id}`, type: "invoice_overdue", severity: "CRITICAL", title: `Invoice overdue — #${inv.number}`, message: `${money(inv.totalCents)}${inv.customerName ? ` from ${inv.customerName}` : ""} · ${d} day${d === 1 ? "" : "s"} past due`, dueAt: iso(inv.dueAt), entityId: inv.id });
      }
    }
  }

  if (settings.lease_expiring.enabled) {
    for (const ls of input.leases) {
      if (ls.termEnd < today) {
        const d = daysBetween(today, ls.termEnd);
        out.push({ key: `lease_expiring:${ls.id}`, type: "lease_expiring", severity: "WARNING", title: `Lease lapsed — ${ls.name}`, message: `Term ended ${iso(ls.termEnd)} (${d} day${d === 1 ? "" : "s"} ago) — renew or remove`, dueAt: iso(ls.termEnd), entityId: ls.id });
      } else if (ls.termEnd <= addDays(today, settings.lease_expiring.leadDays)) {
        const d = daysBetween(ls.termEnd, today);
        out.push({ key: `lease_expiring:${ls.id}`, type: "lease_expiring", severity: "INFO", title: `Lease expiring — ${ls.name}`, message: `Term ends ${iso(ls.termEnd)} in ${d} day${d === 1 ? "" : "s"}`, dueAt: iso(ls.termEnd), entityId: ls.id });
      }
    }
  }

  if (settings.budget_over.enabled) {
    for (const b of input.budgetActuals) {
      if (b.actualCents > b.budgetCents) {
        out.push({ key: `budget_over:${b.id}`, type: "budget_over", severity: "WARNING", title: `Over budget — ${b.label}`, message: `Spent ${money(b.actualCents)} of ${money(b.budgetCents)} budget`, dueAt: null, entityId: b.id });
      }
    }
  }

  const rank: Record<AlertSeverity, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

export function mergeSettings(rows: { type: string; enabled: boolean; leadDays: number }[]): AlertSettings {
  const merged: AlertSettings = JSON.parse(JSON.stringify(DEFAULT_ALERT_SETTINGS));
  for (const r of rows) if (r.type in merged) merged[r.type as AlertType] = { enabled: r.enabled, leadDays: r.leadDays };
  return merged;
}
