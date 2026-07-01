"use client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { PrimaryButton } from "@/components/ui/button";
import { csvToTable, parseOfx, type ParsedRow } from "@fl/core";
import { fmtDate } from "@/lib/format";
import { Upload, Link2, CheckCircle2, ArrowLeft } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type StmtLine = { date: string; description: string; amountCents: string; error?: string };
type Txn = { id: string; date: string; description: string; amountCents: string; account: { label: string } };
type MatchResult = {
  matches: { statement: StmtLine; transaction: Txn }[];
  unmatchedStatement: StmtLine[];
  unmatchedLedger: Txn[];
};

export function ReconcileFlow({ farmId }: { farmId: string }) {
  const [step, setStep] = useState<"upload" | "review" | "done">("upload");
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<MatchResult | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [reconciledCount, setReconciledCount] = useState(0);

  async function onFile(file: File) {
    const text = await file.text();
    const isOfx = /\.(ofx|qfx)$/i.test(file.name) || /<OFX>|<STMTTRN/i.test(text);
    let rows: ParsedRow[];
    if (isOfx) rows = parseOfx(text);
    else {
      const t = csvToTable(text);
      const di = t.headers.findIndex((h) => /date|posted/i.test(h));
      const ni = t.headers.findIndex((h) => /desc|name|memo|payee/i.test(h));
      const ai = t.headers.findIndex((h) => /amount|amt/i.test(h));
      rows = t.rows.map((r) => ({ date: r[di] ?? "", description: r[ni] ?? "", amount: r[ai] ?? "" }));
    }
    setBusy(true);
    try {
      const res = await fetch(`${API}/farms/${farmId}/reconcile/match`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rows }),
      });
      const result: MatchResult = await res.json();
      setData(result);
      setChecked(Object.fromEntries(result.matches.map((m) => [m.transaction.id, true])));
      setStep("review");
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!data) return;
    setBusy(true);
    try {
      const ids = data.matches.map((m) => m.transaction.id).filter((id) => checked[id]);
      const res = await fetch(`${API}/farms/${farmId}/reconcile/commit`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ transactionIds: ids }),
      });
      setReconciledCount((await res.json()).reconciled);
      setStep("done");
    } finally {
      setBusy(false);
    }
  }

  const checkedCount = data ? data.matches.filter((m) => checked[m.transaction.id]).length : 0;

  return (
    <>
      <a href="/transactions" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft size={15} /> Back to Transactions</a>

      {step === "upload" && (
        <Card className="p-6">
          <h3 className="font-serif text-xl font-semibold text-ink">Reconcile a bank statement</h3>
          <p className="mt-1 text-sm text-muted">Upload a statement export (CSV, OFX, or QFX). We&rsquo;ll match each line to an unreconciled ledger transaction by amount and date, so you can confirm what&rsquo;s cleared.</p>
          <label className="mt-5 flex cursor-pointer flex-col items-center gap-2 rounded-card border-2 border-dashed border-border py-14 text-center hover:bg-tag/20">
            <Upload size={26} className="text-muted" />
            <span className="text-sm text-muted">{busy ? "Matching…" : "Click to choose a statement file"}</span>
            <input type="file" accept=".csv,.ofx,.qfx,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
        </Card>
      )}

      {step === "review" && data && (
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h3 className="flex items-center gap-2 font-serif text-xl font-semibold text-ink"><Link2 size={18} /> Matched ({data.matches.length})</h3>
              <PrimaryButton onClick={commit} disabled={busy || checkedCount === 0}>{busy ? "Saving…" : `Mark ${checkedCount} reconciled`}</PrimaryButton>
            </div>
            {data.matches.length === 0 ? <p className="px-5 py-8 text-center text-sm text-muted">No statement lines matched the ledger.</p> : (
              <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm">
                <thead><tr className="text-left text-xs uppercase tracking-wider text-muted">
                  <th className="px-5 py-3"></th><th className="px-5 py-3">Statement line</th><th className="px-5 py-3">Ledger transaction</th><th className="px-5 py-3 text-right">Amount</th>
                </tr></thead>
                <tbody>
                  {data.matches.map((m) => (
                    <tr key={m.transaction.id} className="border-t border-border">
                      <td className="px-5 py-3"><input type="checkbox" checked={!!checked[m.transaction.id]} onChange={(e) => setChecked({ ...checked, [m.transaction.id]: e.target.checked })} /></td>
                      <td className="px-5 py-3"><span className="text-ink">{m.statement.description}</span><br /><span className="text-xs text-muted">{m.statement.date}</span></td>
                      <td className="px-5 py-3"><span className="text-ink">{m.transaction.description}</span><br /><span className="text-xs text-muted">{m.transaction.account.label} · {fmtDate(m.transaction.date)}</span></td>
                      <td className="px-5 py-3 text-right"><Money cents={m.transaction.amountCents} sign /></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <Card className="p-5">
              <h4 className="font-serif text-lg font-semibold text-ink">Unmatched on statement ({data.unmatchedStatement.length})</h4>
              <p className="mb-3 text-xs text-muted">Lines with no ledger match — likely missing transactions to import.</p>
              <div className="space-y-2">
                {data.unmatchedStatement.map((s, i) => (
                  <div key={i} className="flex items-center justify-between rounded-btn bg-surface-sunken px-3 py-2 text-sm">
                    <span className="text-ink">{s.description} <span className="text-muted">· {s.date}</span></span>
                    {!s.error && <Money cents={s.amountCents} sign className="text-sm" />}
                  </div>
                ))}
                {data.unmatchedStatement.length === 0 && <p className="text-sm text-muted">All statement lines matched.</p>}
              </div>
            </Card>
            <Card className="p-5">
              <h4 className="font-serif text-lg font-semibold text-ink">Unreconciled in ledger ({data.unmatchedLedger.length})</h4>
              <p className="mb-3 text-xs text-muted">Recorded but not on this statement.</p>
              <div className="space-y-2">
                {data.unmatchedLedger.slice(0, 8).map((t) => (
                  <div key={t.id} className="flex items-center justify-between rounded-btn bg-surface-sunken px-3 py-2 text-sm">
                    <span className="text-ink">{t.description} <span className="text-muted">· {fmtDate(t.date)}</span></span>
                    <Money cents={t.amountCents} sign className="text-sm" />
                  </div>
                ))}
                {data.unmatchedLedger.length > 8 && <p className="text-xs text-muted">+{data.unmatchedLedger.length - 8} more</p>}
              </div>
            </Card>
          </div>
        </div>
      )}

      {step === "done" && (
        <Card className="p-8 text-center">
          <CheckCircle2 size={40} className="mx-auto text-positive" />
          <h3 className="mt-3 font-serif text-2xl font-semibold text-ink">Reconciliation saved</h3>
          <p className="mt-1 text-sm text-muted">{reconciledCount} transaction{reconciledCount === 1 ? "" : "s"} marked reconciled.</p>
          <div className="mt-6 flex justify-center gap-2">
            <a href="/transactions" className="rounded-btn bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-deep">View Transactions</a>
            <button onClick={() => { setStep("upload"); setData(null); }} className="rounded-btn border border-border px-4 py-2.5 text-sm text-ink hover:bg-tag/40">Reconcile another</button>
          </div>
        </Card>
      )}
    </>
  );
}
