"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { PrimaryButton } from "@/components/ui/button";
import { Modal, Field, ModalActions } from "@/components/ui/modal";
import { CONTRACT_TYPES } from "@/lib/contracts";

const API = process.env.NEXT_PUBLIC_API_URL ?? "/api";

export type ContractVM = {
  id: string; number: string | null; commodity: string; cropYear: number; type: string; quantity: number; unit: string;
  price: number | null; basis: number | null; buyer: string | null; deliveryStart: string | null; deliveryEnd: string | null;
  delivered: number; status: string; notes: string | null;
};
type Form = Record<keyof Omit<ContractVM, "id">, string>;
const toForm = (c?: ContractVM, commodities: string[] = [], year = new Date().getUTCFullYear()): Form => ({
  number: c?.number ?? "", commodity: c?.commodity ?? commodities[0] ?? "Corn", cropYear: String(c?.cropYear ?? year), type: c?.type ?? "forward",
  quantity: c ? String(c.quantity) : "", unit: c?.unit ?? "bu", price: c?.price == null ? "" : String(c.price), basis: c?.basis == null ? "" : String(c.basis),
  buyer: c?.buyer ?? "", deliveryStart: c?.deliveryStart ?? "", deliveryEnd: c?.deliveryEnd ?? "", delivered: c ? String(c.delivered) : "0", status: c?.status ?? "open", notes: c?.notes ?? "",
});

/** Add or edit a marketing contract. Without `contract` it renders the Add button. */
export function ContractButton({ farmId, contract, commodities }: { farmId: string; contract?: ContractVM; commodities: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState<Form>(() => toForm(contract, commodities));
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      const body = {
        number: f.number || undefined, commodity: f.commodity, cropYear: Number(f.cropYear), type: f.type, quantity: Number(f.quantity), unit: f.unit,
        price: num(f.price), basis: num(f.basis), buyer: f.buyer || undefined, deliveryStart: f.deliveryStart || null, deliveryEnd: f.deliveryEnd || null,
        delivered: Number(f.delivered || 0), status: f.status, notes: f.notes || undefined,
      };
      const res = await fetch(`${API}/farms/${farmId}/contracts${contract ? `/${contract.id}` : ""}`, { method: contract ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? "Save failed");
      setOpen(false); if (!contract) setF(toForm(undefined, commodities)); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Invalid input"); } finally { setBusy(false); }
  }
  async function remove() {
    if (!contract || !confirm("Delete this contract?")) return;
    const res = await fetch(`${API}/farms/${farmId}/contracts/${contract.id}`, { method: "DELETE" });
    if (res.ok) router.refresh(); else alert("Delete failed");
  }

  return (
    <>
      {contract ? (
        <span className="flex justify-end gap-3 text-muted">
          <button onClick={() => setOpen(true)} className="hover:text-ink" title="Edit"><Pencil size={15} /></button>
          <button onClick={remove} className="hover:text-negative" title="Delete"><Trash2 size={15} /></button>
        </span>
      ) : <PrimaryButton onClick={() => setOpen(true)}><Plus size={16} /> Add Contract</PrimaryButton>}
      <Modal open={open} onClose={() => setOpen(false)} title={contract ? "Edit Contract" : "Add Contract"} wide>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Commodity"><input list="contract-commodities" value={f.commodity} onChange={set("commodity")} className="input" required /></Field>
            <Field label="Crop Year"><input type="number" value={f.cropYear} onChange={set("cropYear")} className="input" required /></Field>
            <Field label="Type"><select value={f.type} onChange={set("type")} className="input">{Object.entries(CONTRACT_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          </div>
          <datalist id="contract-commodities">{commodities.map((c) => <option key={c} value={c} />)}</datalist>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Field label="Quantity"><input value={f.quantity} onChange={set("quantity")} inputMode="decimal" className="input" required /></Field>
            <Field label="Unit"><input value={f.unit} onChange={set("unit")} className="input" required /></Field>
            <Field label="Price ($)"><input value={f.price} onChange={set("price")} inputMode="decimal" className="input" placeholder={f.type === "basis" ? "Unpriced" : "0.00"} /></Field>
            <Field label="Basis"><input value={f.basis} onChange={set("basis")} inputMode="decimal" className="input" placeholder="-0.35" /></Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Buyer"><input value={f.buyer} onChange={set("buyer")} className="input" /></Field>
            <Field label="Contract #"><input value={f.number} onChange={set("number")} className="input" /></Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Field label="Delivery From"><input type="date" value={f.deliveryStart} onChange={set("deliveryStart")} className="input" /></Field>
            <Field label="Delivery To"><input type="date" value={f.deliveryEnd} onChange={set("deliveryEnd")} className="input" /></Field>
            <Field label="Delivered"><input value={f.delivered} onChange={set("delivered")} inputMode="decimal" className="input" /></Field>
            <Field label="Status"><select value={f.status} onChange={set("status")} className="input"><option value="open">Open</option><option value="delivered">Delivered</option><option value="cancelled">Cancelled</option></select></Field>
          </div>
          {error && <p className="text-sm text-negative">{error}</p>}
          <ModalActions onCancel={() => setOpen(false)} busy={busy} submitLabel="Save" />
        </form>
      </Modal>
    </>
  );
}
