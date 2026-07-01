"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toCents } from "@fl/core";
import { PrimaryButton } from "@/components/ui/button";
import { Modal, Field, ModalActions } from "@/components/ui/modal";

const API = process.env.NEXT_PUBLIC_API_URL ?? "/api";
const TYPES = [["EQUIPMENT_LOAN", "Equipment Loan"], ["OPERATING_LINE", "Operating Line"], ["MORTGAGE", "Mortgage"], ["OTHER", "Other"]] as const;
const FREQ = ["monthly", "quarterly", "semiannual", "annual"] as const;

export function AddLiabilityButton({ farmId }: { farmId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ type: "EQUIPMENT_LOAN", name: "", lender: "", original: "", balance: "", ratePct: "", paymentFreq: "monthly", nextPaymentAt: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      setBusy(true);
      const body = {
        type: f.type, name: f.name, lender: f.lender || undefined,
        originalCents: toCents(f.original).toString(),
        balanceCents: toCents(f.balance || f.original).toString(),
        ratePct: Number(f.ratePct || 0), paymentFreq: f.paymentFreq,
        nextPaymentAt: f.nextPaymentAt || undefined,
      };
      const res = await fetch(`${API}/farms/${farmId}/liabilities`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? "Create failed");
      setOpen(false); setF({ type: "EQUIPMENT_LOAN", name: "", lender: "", original: "", balance: "", ratePct: "", paymentFreq: "monthly", nextPaymentAt: "" });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid input");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PrimaryButton onClick={() => setOpen(true)}><Plus size={16} /> Add Liability</PrimaryButton>
      <Modal open={open} onClose={() => setOpen(false)} title="Add Liability">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Name"><input value={f.name} onChange={set("name")} className="input" placeholder="e.g. Tractor Loan" required /></Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Type"><select value={f.type} onChange={set("type")} className="input">{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            <Field label="Lender"><input value={f.lender} onChange={set("lender")} className="input" placeholder="e.g. AgriBank" /></Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Original Amount ($)"><input value={f.original} onChange={set("original")} inputMode="decimal" className="input" placeholder="0.00" required /></Field>
            <Field label="Current Balance ($)" hint="Defaults to original"><input value={f.balance} onChange={set("balance")} inputMode="decimal" className="input" placeholder="0.00" /></Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Rate (%)"><input value={f.ratePct} onChange={set("ratePct")} inputMode="decimal" className="input" placeholder="6.5" /></Field>
            <Field label="Frequency"><select value={f.paymentFreq} onChange={set("paymentFreq")} className="input">{FREQ.map((v) => <option key={v} value={v} className="capitalize">{v}</option>)}</select></Field>
            <Field label="Next Payment"><input type="date" value={f.nextPaymentAt} onChange={set("nextPaymentAt")} className="input" /></Field>
          </div>
          {error && <p className="text-sm text-negative">{error}</p>}
          <ModalActions onCancel={() => setOpen(false)} submitLabel="Add Liability" busy={busy} disabled={!f.name || !f.original} />
        </form>
      </Modal>
    </>
  );
}
