"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { PrimaryButton } from "@/components/ui/button";
import { Plus, X } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const KINDS = ["planting", "calving", "harvest", "breeding", "other"] as const;

export function NewPlanButton({ farmId }: { farmId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<(typeof KINDS)[number]>("planting");
  const [startAt, setStartAt] = useState(new Date().toISOString().slice(0, 10));
  const [endAt, setEndAt] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null); setBusy(true);
    try {
      const res = await fetch(`${API}/farms/${farmId}/plans`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, kind, startAt, endAt: endAt || null, note: note || undefined }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? "Failed");
      setOpen(false); setTitle(""); setNote(""); setEndAt(""); router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid input");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PrimaryButton onClick={() => setOpen(true)}><Plus size={16} /> New Production Plan</PrimaryButton>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setOpen(false)}>
          <Card className="w-full max-w-md p-6">
            <div onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="font-serif text-2xl font-semibold text-ink">New Production Plan</h3>
                <button onClick={() => setOpen(false)} className="text-muted hover:text-ink"><X size={18} /></button>
              </div>
              <div className="mt-5 space-y-4">
                <label className="block">
                  <span className="mb-1 block text-xs uppercase tracking-wider text-muted">Title</span>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" placeholder="e.g. Corn planting — North Field" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs uppercase tracking-wider text-muted">Type</span>
                  <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="input capitalize">
                    {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1 block text-xs uppercase tracking-wider text-muted">Start</span>
                    <input type="date" value={startAt} onChange={(e) => setStartAt(e.target.value)} className="input" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs uppercase tracking-wider text-muted">End (optional)</span>
                    <input type="date" value={endAt} onChange={(e) => setEndAt(e.target.value)} className="input" />
                  </label>
                </div>
                <label className="block">
                  <span className="mb-1 block text-xs uppercase tracking-wider text-muted">Note (optional)</span>
                  <input value={note} onChange={(e) => setNote(e.target.value)} className="input" placeholder="Acreage, field, herd…" />
                </label>
                {error && <p className="text-sm text-negative">{error}</p>}
                <div className="flex justify-end gap-2 pt-1">
                  <button onClick={() => setOpen(false)} className="rounded-btn border border-border px-4 py-2.5 text-sm text-ink hover:bg-tag/40">Cancel</button>
                  <button onClick={submit} disabled={busy || !title} className="rounded-btn bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-deep disabled:opacity-50">{busy ? "Saving…" : "Create plan"}</button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
