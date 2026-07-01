"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toCents } from "@fl/core";
import { PrimaryButton } from "@/components/ui/button";
import { Modal, Field, ModalActions } from "@/components/ui/modal";

const API = process.env.NEXT_PUBLIC_API_URL ?? "/api";
const EMPTY = { type: "CASH_RENT", name: "", lessor: "", acres: "", termStart: "", termEnd: "", annualRent: "", paymentFreq: "annual", nextPaymentAt: "" };

export function AddLeaseButton({ farmId }: { farmId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState(EMPTY);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const cropShare = f.type === "CROP_SHARE";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      setBusy(true);
      const body = {
        type: f.type, name: f.name, lessor: f.lessor || undefined, acres: Number(f.acres || 0),
        termStart: f.termStart, termEnd: f.termEnd,
        annualRentCents: cropShare || !f.annualRent ? undefined : toCents(f.annualRent).toString(),
        paymentFreq: f.paymentFreq, nextPaymentAt: f.nextPaymentAt || undefined,
      };
      const res = await fetch(`${API}/farms/${farmId}/leases`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? "Create failed");
      setOpen(false); setF(EMPTY); router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid input");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PrimaryButton onClick={() => setOpen(true)}><Plus size={16} /> Add Lease</PrimaryButton>
      <Modal open={open} onClose={() => setOpen(false)} title="Add Lease">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Name"><input value={f.name} onChange={set("name")} className="input" placeholder="e.g. River Bottom Fields" required /></Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Type"><select value={f.type} onChange={set("type")} className="input"><option value="CASH_RENT">Cash Rent</option><option value="CROP_SHARE">Crop Share</option></select></Field>
            <Field label="Lessor"><input value={f.lessor} onChange={set("lessor")} className="input" placeholder="e.g. Smith Family Trust" /></Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Acres"><input value={f.acres} onChange={set("acres")} inputMode="decimal" className="input" placeholder="0" required /></Field>
            <Field label="Term Start"><input type="date" value={f.termStart} onChange={set("termStart")} className="input" required /></Field>
            <Field label="Term End"><input type="date" value={f.termEnd} onChange={set("termEnd")} className="input" required /></Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Annual Rent ($)"><input value={f.annualRent} onChange={set("annualRent")} inputMode="decimal" className="input" placeholder={cropShare ? "n/a — crop share" : "0.00"} disabled={cropShare} /></Field>
            <Field label="Frequency"><select value={f.paymentFreq} onChange={set("paymentFreq")} className="input">{["annual", "semiannual", "quarterly", "monthly"].map((v) => <option key={v} value={v}>{v}</option>)}</select></Field>
            <Field label="Next Payment"><input type="date" value={f.nextPaymentAt} onChange={set("nextPaymentAt")} className="input" disabled={cropShare} /></Field>
          </div>
          {error && <p className="text-sm text-negative">{error}</p>}
          <ModalActions onCancel={() => setOpen(false)} submitLabel="Add Lease" busy={busy} disabled={!f.name || !f.acres || !f.termStart || !f.termEnd} />
        </form>
      </Modal>
    </>
  );
}
