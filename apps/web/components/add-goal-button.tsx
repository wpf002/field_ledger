"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toCents } from "@fl/core";
import { Modal, Field, ModalActions } from "@/components/ui/modal";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const EMPTY = { name: "", kind: "savings", target: "", current: "", dueAt: "", note: "" };

export function AddGoalButton({ farmId }: { farmId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState(EMPTY);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      setBusy(true);
      const body = {
        name: f.name, kind: f.kind, targetCents: toCents(f.target).toString(),
        currentCents: f.current ? toCents(f.current).toString() : undefined,
        dueAt: f.dueAt || undefined, note: f.note || undefined,
      };
      const res = await fetch(`${API}/farms/${farmId}/goals`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
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
      <button onClick={() => setOpen(true)} aria-label="Add goal" className="flex items-center justify-center rounded-btn bg-primary p-2 text-white hover:bg-primary-deep"><Plus size={16} /></button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add Financial Goal">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Name"><input value={f.name} onChange={set("name")} className="input" placeholder="e.g. New Combine Fund" required /></Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Type"><select value={f.kind} onChange={set("kind")} className="input"><option value="savings">Savings</option><option value="income_target">Income Target</option></select></Field>
            <Field label="Due (optional)"><input type="date" value={f.dueAt} onChange={set("dueAt")} className="input" /></Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Target ($)"><input value={f.target} onChange={set("target")} inputMode="decimal" className="input" placeholder="0.00" required /></Field>
            <Field label="Current ($)"><input value={f.current} onChange={set("current")} inputMode="decimal" className="input" placeholder="0.00" /></Field>
          </div>
          <Field label="Note (optional)"><textarea value={f.note} onChange={set("note")} rows={2} className="input" placeholder="What's this goal for?" /></Field>
          {error && <p className="text-sm text-negative">{error}</p>}
          <ModalActions onCancel={() => setOpen(false)} submitLabel="Add Goal" busy={busy} disabled={!f.name || !f.target} />
        </form>
      </Modal>
    </>
  );
}
