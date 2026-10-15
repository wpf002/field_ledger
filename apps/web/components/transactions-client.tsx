"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { CategoryPill } from "@/components/ui/category-pill";
import { Money } from "@/components/ui/money";
import { PrimaryButton } from "@/components/ui/button";
import Link from "next/link";
import { toCents } from "@fl/core";
import { fmtDate } from "@/lib/format";
import { Plus, Pencil, Trash2, X, Upload, Link2, CheckCircle2 } from "lucide-react";
import { Toolbar, Pagination } from "@/components/ui/list-controls";
import { PAGE_SIZE } from "@/lib/paging";

export type Account = { id: string; code: string; label: string; kind: "INCOME" | "EXPENSE" };
export type Txn = {
  id: string;
  date: string;
  description: string;
  amountCents: string;
  relatedLabel: string | null;
  relatedInventory: { name: string } | null;
  account: { code: string; label: string; kind: "INCOME" | "EXPENSE" };
  reconciled?: boolean;
  landParcel?: { id: string; name: string } | null;
};
export type Field = { id: string; name: string };

const API = process.env.NEXT_PUBLIC_API_URL ?? "/api";

/** Capitalize each word so related items read consistently (e.g. "mixed cube
 *  feed" → "Mixed Cube Feed") regardless of how they were entered. */
const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

export function TransactionsClient({ farmId, initial, accounts, fields = [], canWrite = true }: { farmId: string; initial: Txn[]; accounts: Account[]; fields?: Field[]; canWrite?: boolean }) {
  const [rows, setRows] = useState<Txn[]>(initial);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Txn | null>(null);

  const filters = useMemo(() => {
    const years = [...new Set(rows.map((t) => t.date.slice(0, 4)))].sort().reverse();
    const cats = [...new Set(rows.map((t) => t.account.label))].sort();
    return [
      { param: "type", label: "All Types", options: [{ value: "INCOME", label: "Income" }, { value: "EXPENSE", label: "Expense" }] },
      { param: "category", label: "All Categories", options: cats.map((c) => ({ value: c, label: c })) },
      { param: "year", label: "All Years", options: years.map((y) => ({ value: y, label: y })) },
      ...(fields.length ? [{ param: "field", label: "All Fields", options: fields.map((f) => ({ value: f.id, label: f.name })) }] : []),
    ];
  }, [rows, fields]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((t) =>
      (!q || t.description.toLowerCase().includes(q) || t.account.label.toLowerCase().includes(q) || (t.relatedInventory?.name ?? t.relatedLabel ?? "").toLowerCase().includes(q)) &&
      (!filter.type || t.account.kind === filter.type) &&
      (!filter.category || t.account.label === filter.category) &&
      (!filter.year || t.date.startsWith(filter.year)) &&
      (!filter.field || t.landParcel?.id === filter.field));
  }, [rows, query, filter]);
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
        <h2 className="font-serif text-3xl font-bold text-primary sm:text-4xl">Transactions</h2>
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
        <Toolbar search={query} onSearch={(v) => { setQuery(v); setPage(1); }} placeholder="Search Transactions" filters={filters} values={filter}
          onFilter={(p, v) => { setFilter((f) => ({ ...f, [p]: v })); setPage(1); }} />
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
            {visible.map((t) => {
              const related = t.relatedInventory?.name ?? t.relatedLabel;
              return (
                <tr key={t.id} className="border-t border-border">
                  <td className="whitespace-nowrap px-5 py-3.5 text-ink">{fmtDate(t.date)}</td>
                  <td className="px-5 py-3.5 text-ink">{t.description}{t.landParcel && <span className="block text-xs text-muted">{t.landParcel.name}</span>}</td>
                  <td className="px-5 py-3.5"><span className="text-muted/60">{related ? <span className="inline-block whitespace-nowrap rounded-pill bg-mint px-3 py-1 text-xs text-positive">{titleCase(related)}</span> : "—"}</span></td>
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
                        <button onClick={() => setEditing(t)} className="hover:text-ink" title="Edit"><Pencil size={16} /></button>
                        <button onClick={() => remove(t.id)} className="hover:text-negative" title="Delete"><Trash2 size={16} /></button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-muted">No Matches</td></tr>
            )}
          </tbody>
        </table>
        </div>
        <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} />
      </Card>

      {(adding || editing) && (
        <TxnModal
          key={editing?.id ?? "new"}
          farmId={farmId}
          accounts={accounts}
          fields={fields}
          edit={editing ?? undefined}
          onClose={() => { setAdding(false); setEditing(null); }}
          onSaved={() => { setAdding(false); setEditing(null); refresh(); }}
        />
      )}
    </>
  );
}

function TxnModal({ farmId, accounts, fields, edit, onClose, onSaved }: { farmId: string; accounts: Account[]; fields: Field[]; edit?: Txn; onClose: () => void; onSaved: () => void }) {
  const editing = !!edit;
  const [kind, setKind] = useState<"INCOME" | "EXPENSE">(edit?.account.kind ?? "EXPENSE");
  const [description, setDescription] = useState(edit?.description ?? "");
  const [amount, setAmount] = useState(edit ? (Math.abs(Number(edit.amountCents)) / 100).toString() : "");
  const [accountCode, setAccountCode] = useState(edit?.account.code ?? "");
  const [date, setDate] = useState(edit ? edit.date.slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [related, setRelated] = useState(edit?.relatedLabel ?? "");
  const [field, setField] = useState(edit?.landParcel?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const choices = accounts.filter((a) => a.kind === kind);

  async function submit() {
    setError(null);
    try {
      const magnitude = toCents(amount); // rejects sub-cent / junk (Invariant 1)
      const signed = kind === "EXPENSE" ? -magnitude : magnitude;
      setBusy(true);
      const res = await fetch(`${API}/farms/${farmId}/transactions${editing ? `/${edit!.id}` : ""}`, {
        method: editing ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          date, description, accountCode: accountCode || choices[0]?.code,
          amountCents: signed.toString(),
          relatedLabel: related || undefined,
          landParcelId: field || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? (editing ? "Update failed" : "Create failed"));
      onSaved();
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
            <h3 className="font-serif text-2xl font-semibold text-ink">{editing ? "Edit Transaction" : "Add Transaction"}</h3>
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
            <div className={fields.length ? "grid grid-cols-1 gap-3 sm:grid-cols-2" : ""}>
              <Field label="Related Item (optional)"><input value={related} onChange={(e) => setRelated(e.target.value)} className="input" placeholder="e.g. Angus Cattle" /></Field>
              {fields.length > 0 && (
                <Field label="Field (optional)">
                  <select value={field} onChange={(e) => setField(e.target.value)} className="input">
                    <option value="">None</option>
                    {fields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </Field>
              )}
            </div>

            {error && <p className="text-sm text-negative">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={onClose} className="rounded-btn border border-border px-4 py-2.5 text-sm text-ink hover:bg-tag/40">Cancel</button>
              <button onClick={submit} disabled={busy || !description || !amount} className="rounded-btn bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-deep disabled:opacity-50">{busy ? "Saving…" : editing ? "Save changes" : "Save"}</button>
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
