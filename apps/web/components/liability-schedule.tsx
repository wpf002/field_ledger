"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { fmtDate } from "@/lib/format";
import { CalendarClock, X, ArrowDownToLine } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "/api";

type Row = { period: number; dueDate: string; paymentCents: string; interestCents: string; principalCents: string; balanceAfterCents: string };

export function LiabilitySchedule({ farmId, id, name, nextPaymentAt }: { farmId: string; id: string; name: string; nextPaymentAt: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [posted, setPosted] = useState<string | null>(null);

  async function load() {
    setOpen(true);
    const res = await fetch(`${API}/farms/${farmId}/liabilities/${id}/schedule`, { cache: "no-store" });
    setRows((await res.json()).rows ?? []);
  }

  async function postPayment() {
    setBusy(true); setPosted(null);
    try {
      const res = await fetch(`${API}/farms/${farmId}/liabilities/${id}/post-payment`, { method: "POST" });
      if (!res.ok) { setPosted((await res.json().catch(() => null))?.message ?? "Post failed"); return; }
      const data = await res.json();
      setPosted(`Posted: interest $${(Number(data.split.interestCents) / 100).toLocaleString()} expensed · principal $${(Number(data.split.principalCents) / 100).toLocaleString()} off balance`);
      router.refresh();
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button onClick={load} className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink">
        <CalendarClock size={13} /> Amortization &amp; payments
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setOpen(false)}>
          <Card className="w-full max-w-2xl p-6" >
            <div onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-serif text-2xl font-semibold text-ink">{name}</h3>
                  <p className="text-sm text-muted">Next payment {nextPaymentAt ? fmtDate(nextPaymentAt) : "—"}</p>
                </div>
                <button onClick={() => setOpen(false)} className="text-muted hover:text-ink"><X size={18} /></button>
              </div>

              <div className="mt-4 flex items-center justify-between rounded-btn bg-surface-sunken px-4 py-3">
                <p className="text-sm text-muted">Post the next scheduled payment to the ledger (interest expensed, principal off balance).</p>
                <button onClick={postPayment} disabled={busy || !nextPaymentAt} className="inline-flex shrink-0 items-center gap-1.5 rounded-btn bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-deep disabled:opacity-50">
                  <ArrowDownToLine size={14} /> {busy ? "Posting…" : "Post next payment"}
                </button>
              </div>
              {posted && <p className="mt-2 text-sm text-positive">{posted}</p>}

              <div className="mt-4 max-h-72 overflow-auto rounded-btn border border-border">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="sticky top-0 bg-surface"><tr className="text-left text-xs uppercase tracking-wider text-muted">
                    <th className="px-3 py-2">#</th><th className="px-3 py-2">Due</th><th className="px-3 py-2 text-right">Payment</th><th className="px-3 py-2 text-right">Interest</th><th className="px-3 py-2 text-right">Principal</th><th className="px-3 py-2 text-right">Balance</th>
                  </tr></thead>
                  <tbody>
                    {rows.slice(0, 24).map((r) => (
                      <tr key={r.period} className="border-t border-border">
                        <td className="px-3 py-1.5 text-muted">{r.period}</td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-ink">{fmtDate(r.dueDate)}</td>
                        <td className="px-3 py-1.5 text-right text-ink"><Money cents={r.paymentCents} /></td>
                        <td className="px-3 py-1.5 text-right text-muted"><Money cents={r.interestCents} /></td>
                        <td className="px-3 py-1.5 text-right text-ink"><Money cents={r.principalCents} /></td>
                        <td className="px-3 py-1.5 text-right text-ink"><Money cents={r.balanceAfterCents} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 24 && <p className="mt-2 text-center text-xs text-muted">Showing first 24 of {rows.length} payments</p>}
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
