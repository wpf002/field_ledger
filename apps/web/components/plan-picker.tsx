"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Check } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "/api";
type PlanKey = "essentials" | "pro" | "business";

/** Plan cards; choosing one opens Stripe Checkout (or the portal), or switches directly while billing is off. */
export function PlanPicker({ farmId, plan, plans, canChange, hasCustomer }: {
  farmId: string; plan: PlanKey; canChange: boolean; hasCustomer: boolean;
  plans: { key: PlanKey; name: string; items: string[] }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function go(path: string, body?: object) {
    setError(null); setBusy(path);
    try {
      const r = await fetch(`${API}/farms/${farmId}/billing/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message ?? "Couldn't change the plan");
      if (j.url) window.location.href = j.url; else router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); } finally { setBusy(null); }
  }
  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((p) => (
          <div key={p.key} className={clsx("flex flex-col rounded-card border p-5", p.key === plan ? "border-primary bg-mint/40" : "border-border")}>
            <h4 className="font-serif text-lg font-semibold text-ink">{p.name}</h4>
            <ul className="mt-3 flex-1 space-y-1.5 text-sm text-muted">
              {p.items.map((i) => <li key={i} className="flex gap-2"><Check size={14} className="mt-0.5 shrink-0 text-primary" />{i}</li>)}
            </ul>
            {p.key === plan ? <span className="mt-4 text-sm font-medium text-primary">Current Plan</span>
              : canChange && <button disabled={!!busy} onClick={() => go("checkout", { plan: p.key })} className="mt-4 rounded-btn bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-deep disabled:opacity-50">{busy ? "Opening…" : `Choose ${p.name}`}</button>}
          </div>
        ))}
      </div>
      {canChange && hasCustomer && <button disabled={!!busy} onClick={() => go("portal")} className="mt-4 rounded-btn border border-border px-4 py-2 text-sm text-ink hover:bg-tag/40">Manage Billing</button>}
      {error && <p className="mt-3 text-sm text-negative">{error}</p>}
    </>
  );
}
