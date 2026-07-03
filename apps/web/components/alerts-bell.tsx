"use client";
import { useEffect, useState, useCallback } from "react";
import { Bell, X, AlertTriangle, AlertOctagon, Info, Settings2, Check } from "lucide-react";
import clsx from "clsx";

const API = process.env.NEXT_PUBLIC_API_URL ?? "/api";

type Alert = { key: string; type: string; severity: "CRITICAL" | "WARNING" | "INFO"; title: string; message: string; dueAt: string | null };
type Settings = Record<string, { enabled: boolean; leadDays: number }>;

const SEV = {
  CRITICAL: { ring: "border-l-negative", text: "text-negative", icon: AlertOctagon },
  WARNING: { ring: "border-l-rust", text: "text-rust", icon: AlertTriangle },
  INFO: { ring: "border-l-primary", text: "text-primary", icon: Info },
};
const RULES: { type: string; label: string }[] = [
  { type: "payment_due", label: "Payment due reminders" },
  { type: "invoice_overdue", label: "Overdue invoice nudges" },
  { type: "lease_expiring", label: "Lease expiry warnings" },
  { type: "budget_over", label: "Budget overage warnings" },
];

export function AlertsBell() {
  const [farmId, setFarmId] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [counts, setCounts] = useState({ total: 0, critical: 0, warning: 0, info: 0 });
  const [open, setOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<Settings>({});

  const refresh = useCallback(async (id: string) => {
    const res = await fetch(`${API}/farms/${id}/alerts`, { cache: "no-store" });
    if (!res.ok) return; // a transient API error must not blank the whole shell
    const data = await res.json().catch(() => null);
    if (Array.isArray(data?.alerts)) setAlerts(data.alerts);
    if (data?.counts) setCounts(data.counts);
  }, []);

  useEffect(() => {
    fetch(`${API}/farm`).then((r) => r.json()).then(async (f) => {
      setFarmId(f.id);
      await refresh(f.id);
      setSettings(await (await fetch(`${API}/farms/${f.id}/alert-settings`)).json());
    }).catch(() => {});
  }, [refresh]);

  async function dismiss(key: string) {
    if (!farmId) return;
    setAlerts((a) => a.filter((x) => x.key !== key));
    setCounts((c) => ({ ...c, total: Math.max(0, c.total - 1) }));
    await fetch(`${API}/farms/${farmId}/alerts/dismiss`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key }) });
  }
  async function toggleRule(type: string, enabled: boolean) {
    if (!farmId) return;
    const next = await (await fetch(`${API}/farms/${farmId}/alert-settings`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ type, enabled, leadDays: settings[type]?.leadDays ?? 30 }) })).json();
    setSettings(next); refresh(farmId);
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="relative flex h-9 w-9 items-center justify-center rounded-btn text-muted hover:bg-tag/60" aria-label="Alerts">
        <Bell size={19} strokeWidth={1.75} />
        {counts.total > 0 && (
          <span className={clsx("absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-pill px-1 text-[10px] font-semibold text-white", counts.critical > 0 ? "bg-negative" : "bg-rust")}>
            {counts.total}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setOpen(false)}>
          <div className="h-full w-[380px] overflow-y-auto bg-bg shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h3 className="font-serif text-xl font-semibold text-ink">Alerts {counts.total > 0 && <span className="text-muted">({counts.total})</span>}</h3>
              <div className="flex items-center gap-1">
                <button onClick={() => setShowSettings((s) => !s)} className="flex h-8 w-8 items-center justify-center rounded-btn text-muted hover:bg-tag/60" aria-label="Alert settings"><Settings2 size={17} /></button>
                <button onClick={() => setOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-btn text-muted hover:bg-tag/60"><X size={18} /></button>
              </div>
            </div>

            {showSettings && (
              <div className="border-b border-border bg-surface px-5 py-4">
                <p className="mb-3 text-xs uppercase tracking-wider text-muted">Notification rules</p>
                <div className="space-y-2.5">
                  {RULES.map((r) => {
                    const on = settings[r.type]?.enabled ?? true;
                    return (
                      <label key={r.type} className="flex cursor-pointer items-center justify-between text-sm">
                        <span className="text-ink">{r.label}</span>
                        <button onClick={() => toggleRule(r.type, !on)} className={clsx("relative h-5 w-9 rounded-pill transition", on ? "bg-primary" : "bg-surface-sunken")} aria-pressed={on}>
                          <span className={clsx("absolute top-0.5 h-4 w-4 rounded-pill bg-white shadow transition", on ? "left-[18px]" : "left-0.5")} />
                        </button>
                      </label>
                    );
                  })}
                </div>
                <p className="mt-3 text-xs text-muted">Email delivery is available behind a flag (not enabled in this build).</p>
              </div>
            )}

            <div className="divide-y divide-border">
              {alerts.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-5 py-16 text-center text-muted">
                  <Check size={26} className="text-positive" />
                  <p className="text-sm">You&rsquo;re all caught up.</p>
                </div>
              ) : alerts.map((a) => {
                const s = SEV[a.severity];
                const Icon = s.icon;
                return (
                  <div key={a.key} className={clsx("flex gap-3 border-l-2 px-5 py-4", s.ring)}>
                    <Icon size={17} className={clsx("mt-0.5 shrink-0", s.text)} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">{a.title}</p>
                      <p className="text-xs text-muted">{a.message}</p>
                    </div>
                    <button onClick={() => dismiss(a.key)} className="shrink-0 text-muted hover:text-ink" aria-label="Dismiss"><X size={15} /></button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
