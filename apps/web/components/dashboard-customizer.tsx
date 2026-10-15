"use client";
import { useState, useTransition } from "react";
import { SlidersHorizontal, ArrowUp, ArrowDown } from "lucide-react";
import { Modal } from "@/components/ui/modal";

/** Pick and order the dashboard's metric tiles. */
export function DashboardCustomizer({ options, selected, defaults, save }: { options: { key: string; label: string }[]; selected: string[]; defaults: string[]; save: (keys: string[]) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [keys, setKeys] = useState(selected);
  const [pending, start] = useTransition();
  const label = new Map(options.map((o) => [o.key, o.label]));
  const move = (i: number, d: number) => setKeys((k) => { const n = [...k]; const j = i + d; if (j < 0 || j >= n.length) return k; [n[i], n[j]] = [n[j]!, n[i]!]; return n; });
  return (
    <>
      <button onClick={() => { setKeys(selected); setOpen(true); }} className="inline-flex items-center gap-2 rounded-btn border border-border px-4 py-2.5 text-sm text-ink hover:bg-tag/40"><SlidersHorizontal size={15} /> Customize</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Dashboard Tiles" wide>
        <div className="grid max-h-[60vh] gap-4 overflow-y-auto sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs uppercase tracking-wider text-muted">Shown</p>
            <ul className="space-y-1 text-sm">
              {keys.map((k, i) => (
                <li key={k} className="flex items-center justify-between gap-2 rounded-btn bg-surface-sunken px-3 py-1.5">
                  <span className="truncate">{label.get(k)}</span>
                  <span className="flex shrink-0 items-center gap-1 text-muted">
                    <button onClick={() => move(i, -1)} title="Move Up" className="hover:text-ink"><ArrowUp size={14} /></button>
                    <button onClick={() => move(i, 1)} title="Move Down" className="hover:text-ink"><ArrowDown size={14} /></button>
                    <button onClick={() => setKeys(keys.filter((x) => x !== k))} className="ml-1 text-xs hover:text-negative">Remove</button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-2 text-xs uppercase tracking-wider text-muted">Available</p>
            <ul className="space-y-1 text-sm">
              {options.filter((o) => !keys.includes(o.key)).map((o) => (
                <li key={o.key}><button onClick={() => setKeys([...keys, o.key])} className="w-full rounded-btn border border-border px-3 py-1.5 text-left hover:bg-tag/40">{o.label}</button></li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-5 flex justify-between gap-2">
          <button onClick={() => setKeys(defaults)} className="rounded-btn border border-border px-4 py-2 text-sm text-ink hover:bg-tag/40">Reset</button>
          <button disabled={pending} onClick={() => start(async () => { await save(keys); setOpen(false); })} className="rounded-btn bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-deep disabled:opacity-50">{pending ? "Saving…" : "Save"}</button>
        </div>
      </Modal>
    </>
  );
}
