"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { CategoryPill } from "@/components/ui/category-pill";
import { Money } from "@/components/ui/money";
import { PrimaryButton } from "@/components/ui/button";
import Link from "next/link";
import { toCents } from "@fl/core";
import { fmtDate } from "@/lib/format";
import { Plus, Search, Pencil, Trash2, X, Upload, Link2, CheckCircle2 } from "lucide-react";

export type Account = { id: string; code: string; label: string; kind: "INCOME" | "EXPENSE" };
export type Txn = {
  id: string;
  date: string;
  description: string;
  amountCents: string;
  relatedLabel: string | null;
  relatedInventory: { name: string } | null;
  account: { label: string; kind: "INCOME" | "EXPENSE" };
  reconciled?: boolean;
};

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function TransactionsClient({ farmId, initial, accounts, canWrite = true }: { farmId: string; initial: Txn[]; accounts: Account[]; canWrite?: boolean }) {
  const [rows, setRows] = useState<Txn[]>(initial);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((t) => t.description.toLowerCase().includes(q) || t.account.label.toLowerCase().includes(q));
  }, [rows, query]);

  async function refresh() {
    const res = await fetch(`${API}/farms/${farmId}/transactions`, { cache: "no-store" });
    setRows(await res.json());
  }

  async function remove(id: string) {
    if (!confirm("Delete this transaction?")) return;
    const res = await fetch(`${API}/farms/${farmId}/transactions/${id}`, { method: "DELETE" });
    if (res.ok) setRows((r) => r.filter((t) => t.id !== id));
    else alert((await res.json().catch(() => null))?.message ?? "Delete failed (period may be locked).");
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-serif text-3xl font-bold text-primary sm:text-4xl">Transactions</h2>
          <p className="mt-1 text-muted">Track your farm&rsquo;s income and expenses.</p>
        </div>
        {canWrite ? (
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/transactions/import" className="inline-flex items-center gap-2 rounded-btn border border-border px-4 py-2.5 text-sm text-ink hover:bg-tag/40"><Upload size={15} /> Import</Link>
            <Link href="/transactions/reconcile" className="inline-flex items-center gap-2 rounded-btn border border-border px-4 py-2.5 text-sm text-ink hover:bg-tag/40"><Link2 size={15} /> Reconcile</Link>
            <PrimaryButton onClick={() => setAdding(true)}><Plus size={16} /> Add Transaction</PrimaryButton>
          </div>
        ) : (
          <span className="rounded-pill bg-tag px-3 py-1.5 text-sm text-muted">Read-only (Viewer)</span>
        )}
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center gap-3 border-b border-border px-5 py-3">
          <Search size={18} className="text-muted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} className="w-full bg-transparent text-sm outline-none placeholder:text-muted" placeholder="Search transactions..." />
        </div>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-muted">
              <th className="px-5 py-3 font-medium">Date</th>
              <th className="px-5 py-3 font-medium">Description</th>
              <th className="px-5 py-3 font-medium">Related Item</th>
              <th className="px-5 py-3 font-medium">Category</th>
              <th className="px-5 py-3 text-right font-medium">Amount</th>
              <th className="px-5 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => {
              const related = t.relatedInventory?.name ?? t.relatedLabel;
              return (
                <tr key={t.id} className="border-t border-border">
                  <td className="whitespace-nowrap px-5 py-3.5 text-ink">{fmtDate(t.date)}</td>
                  <td className="px-5 py-3.5 text-ink">{t.description}</td>
                  <td className="px-5 py-3.5"><span className="text-muted/60">{related ? <span className="inline-block whitespace-nowrap rounded-pill bg-mint px-3 py-1 text-xs text-positive">{related}</span> : "—"}</span></td>
                  <td className="px-5 py-3.5"><CategoryPill>{t.account.label}</CategoryPill></td>
                  <td className="px-5 py-3.5 text-right">
                    <span className="inline-flex items-center gap-1.5">
                      {t.reconciled && <CheckCircle2 size={13} className="text-positive" aria-label="Reconciled" />}
                      <Money cents={t.amountCents} sign />
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    {canWrite && (
                      <div className="flex justify-end gap-3 text-muted">
                        <button className="hover:text-ink" title="Edit"><Pencil size={16} /></button>
                        <button onClick={() => remove(t.id)} className="hover:text-negative" title="Delete"><Trash2 size={16} /></button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-muted">No transactions match your search.</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </Card>

      {adding && <AddModal farmId={farmId} accounts={accounts} onClose={() => setAdding(false)} onAdded={() => { setAdding(false); refresh(); }} />}
    </>
  );
}

function AddModal({ farmId, accounts, onClose, onAdded }: { farmId: string; accounts: Account[]; onClose: () => void; onAdded: () => void }) {
  const [kind, setKind] = useState<"INCOME" | "EXPENSE">("EXPENSE");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [accountCode, setAccountCode] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [related, setRelated] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const choices = accounts.filter((a) => a.kind === kind);

  async function submit() {
    setError(null);
    try {
      const magnitude = toCents(amount); // rejects sub-cent / junk (Invariant 1)
      const signed = kind === "EXPENSE" ? -magnitude : magnitude;
      setBusy(true);
      const res = await fetch(`${API}/farms/${farmId}/transactions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          date, description, accountCode: accountCode || choices[0]?.code,
          amountCents: signed.toString(),
          relatedLabel: related || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? "Create failed");
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid input");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <Card className="w-full max-w-md p-6" >
        <div onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-2xl font-semibold text-ink">Add Transaction</h3>
            <button onClick={onClose} className="text-muted hover:text-ink"><X size={18} /></button>
          </div>

          <div className="mt-5 space-y-4">
            <div className="inline-flex gap-1 rounded-pill bg-surface-sunken p-1">
              {(["EXPENSE", "INCOME"] as const).map((k) => (
                <button key={k} onClick={() => { setKind(k); setAccountCode(""); }} className={`rounded-pill px-4 py-1.5 text-sm capitalize transition ${kind === k ? "bg-surface text-ink shadow-card" : "text-muted"}`}>{k.toLowerCase()}</button>
              ))}
            </div>

            <Field label="Description"><input value={description} onChange={(e) => setDescription(e.target.value)} className="input" placeholder="e.g. Diesel for tractors" /></Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Amount ($)"><input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="input" placeholder="0.00" /></Field>
              <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" /></Field>
            </div>
            <Field label="Category">
              <select value={accountCode} onChange={(e) => setAccountCode(e.target.value)} className="input">
                <option value="">Select category…</option>
                {choices.map((a) => <option key={a.code} value={a.code}>{a.label}</option>)}
              </select>
            </Field>
            <Field label="Related Item (optional)"><input value={related} onChange={(e) => setRelated(e.target.value)} className="input" placeholder="e.g. Angus Cattle" /></Field>

            {error && <p className="text-sm text-negative">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={onClose} className="rounded-btn border border-border px-4 py-2.5 text-sm text-ink hover:bg-tag/40">Cancel</button>
              <button onClick={submit} disabled={busy || !description || !amount} className="rounded-btn bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-deep disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-wider text-muted">{label}</span>
      {children}
    </label>
  );
}
