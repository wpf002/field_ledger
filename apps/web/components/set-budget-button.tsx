"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { toCents } from "@fl/core";
import { Plus, X } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
type Account = { code: string; label: string; kind: "INCOME" | "EXPENSE" };

export function SetBudgetButton({ farmId }: { farmId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [period, setPeriod] = useState<"MONTHLY" | "ANNUAL">("MONTHLY");
  const [accountCode, setAccountCode] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openModal() {
    setOpen(true);
    if (accounts.length === 0) {
      const all: Account[] = await (await fetch(`${API}/farms/${farmId}/accounts`)).json();
      setAccounts(all.filter((a) => a.kind === "EXPENSE"));
    }
  }

  async function submit() {
    setError(null);
    try {
      const amountCents = toCents(amount).toString();
      setBusy(true);
      const res = await fetch(`${API}/farms/${farmId}/budgets`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ period, year: new Date().getUTCFullYear(), month: null, accountCode: accountCode || accounts[0]?.code, amountCents }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? "Failed");
      setOpen(false); setAmount(""); router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid input");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button onClick={openModal} className="flex items-center gap-1.5 rounded-btn border border-border px-3 py-2 text-sm text-ink hover:bg-tag/40"><Plus size={15} /> Set Budget</button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setOpen(false)}>
          <Card className="w-full max-w-md p-6">
            <div onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="font-serif text-2xl font-semibold text-ink">Set Budget</h3>
                <button onClick={() => setOpen(false)} className="text-muted hover:text-ink"><X size={18} /></button>
              </div>
              <div className="mt-5 space-y-4">
                <div className="inline-flex gap-1 rounded-pill bg-surface-sunken p-1">
                  {(["MONTHLY", "ANNUAL"] as const).map((p) => (
                    <button key={p} onClick={() => setPeriod(p)} className={`rounded-pill px-4 py-1.5 text-sm capitalize transition ${period === p ? "bg-surface text-ink shadow-card" : "text-muted"}`}>{p.toLowerCase()}</button>
                  ))}
                </div>
                <label className="block">
                  <span className="mb-1 block text-xs uppercase tracking-wider text-muted">Category</span>
                  <select className="input" value={accountCode} onChange={(e) => setAccountCode(e.target.value)}>
                    <option value="">Select category…</option>
                    {accounts.map((a) => <option key={a.code} value={a.code}>{a.label}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs uppercase tracking-wider text-muted">{period === "MONTHLY" ? "Monthly" : "Annual"} amount ($)</span>
                  <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="input" placeholder="0.00" />
                </label>
                {error && <p className="text-sm text-negative">{error}</p>}
                <div className="flex justify-end gap-2 pt-1">
                  <button onClick={() => setOpen(false)} className="rounded-btn border border-border px-4 py-2.5 text-sm text-ink hover:bg-tag/40">Cancel</button>
                  <button onClick={submit} disabled={busy || !amount} className="rounded-btn bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-deep disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
