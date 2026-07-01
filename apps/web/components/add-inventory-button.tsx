"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toCents } from "@fl/core";
import { PrimaryButton } from "@/components/ui/button";
import { Modal, Field, ModalActions } from "@/components/ui/modal";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const CATS = ["LIVESTOCK", "FEED", "CROPS", "EQUIPMENT", "SUPPLIES"] as const;
const EMPTY = { category: "LIVESTOCK", name: "", quantity: "", unit: "", location: "", unitValue: "", costBasis: "", usefulLifeYears: "" };

export function AddInventoryButton({ farmId }: { farmId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState(EMPTY);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const equipment = f.category === "EQUIPMENT";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      setBusy(true);
      const body = {
        category: f.category, name: f.name, quantity: Number(f.quantity || 0), unit: f.unit, location: f.location || undefined,
        unitValueCents: !equipment && f.unitValue ? toCents(f.unitValue).toString() : undefined,
        costBasisCents: equipment && f.costBasis ? toCents(f.costBasis).toString() : undefined,
        usefulLifeYears: equipment && f.usefulLifeYears ? Number(f.usefulLifeYears) : undefined,
        acquiredAt: equipment ? new Date().toISOString() : undefined,
      };
      const res = await fetch(`${API}/farms/${farmId}/inventory`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
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
      <PrimaryButton onClick={() => setOpen(true)}><Plus size={16} /> Add Item</PrimaryButton>
      <Modal open={open} onClose={() => setOpen(false)} title="Add Inventory Item">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Name"><input value={f.name} onChange={set("name")} className="input" placeholder="e.g. Angus Cattle" required /></Field>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Category"><select value={f.category} onChange={set("category")} className="input">{CATS.map((c) => <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>)}</select></Field>
            <Field label="Quantity"><input value={f.quantity} onChange={set("quantity")} inputMode="decimal" className="input" placeholder="0" required /></Field>
            <Field label="Unit"><input value={f.unit} onChange={set("unit")} className="input" placeholder="head, bales…" required /></Field>
          </div>
          <Field label="Location (optional)"><input value={f.location} onChange={set("location")} className="input" placeholder="e.g. North Pasture" /></Field>
          {equipment ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Cost Basis ($)"><input value={f.costBasis} onChange={set("costBasis")} inputMode="decimal" className="input" placeholder="0.00" /></Field>
              <Field label="Useful Life (years)"><input value={f.usefulLifeYears} onChange={set("usefulLifeYears")} inputMode="numeric" className="input" placeholder="e.g. 10" /></Field>
            </div>
          ) : (
            <Field label="Value per Unit ($)" hint="Leave blank to use market pricing"><input value={f.unitValue} onChange={set("unitValue")} inputMode="decimal" className="input" placeholder="0.00" /></Field>
          )}
          {error && <p className="text-sm text-negative">{error}</p>}
          <ModalActions onCancel={() => setOpen(false)} submitLabel="Add Item" busy={busy} disabled={!f.name || !f.quantity || !f.unit} />
        </form>
      </Modal>
    </>
  );
}
