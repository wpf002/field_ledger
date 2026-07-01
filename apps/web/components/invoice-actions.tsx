"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Send, CheckCircle2 } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "/api";

export function InvoiceActions({ farmId, id, number, status }: { farmId: string; id: string; number: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const paid = status === "PAID";

  async function act(action: "send" | "pay") {
    setBusy(action);
    try {
      const res = await fetch(`${API}/farms/${farmId}/invoices/${id}/${action}`, { method: "POST" });
      if (!res.ok) alert((await res.json().catch(() => null))?.message ?? "Action failed");
      else router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-3 flex items-center gap-2">
      <Link href={`/revenue/invoices/${id}`} className="inline-flex items-center gap-1.5 rounded-btn border border-border px-3 py-1.5 text-xs text-ink hover:bg-tag/40"><FileText size={13} /> View / PDF</Link>
      {!paid && (
        <button onClick={() => act("send")} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-btn border border-border px-3 py-1.5 text-xs text-ink hover:bg-tag/40 disabled:opacity-50"><Send size={13} /> {busy === "send" ? "Sending…" : "Send"}</button>
      )}
      {!paid && (
        <button onClick={() => act("pay")} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-btn bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-deep disabled:opacity-50"><CheckCircle2 size={13} /> {busy === "pay" ? "Recording…" : "Mark Paid"}</button>
      )}
      {paid && <span className="inline-flex items-center gap-1.5 text-xs text-positive"><CheckCircle2 size={13} /> Paid</span>}
    </div>
  );
}
