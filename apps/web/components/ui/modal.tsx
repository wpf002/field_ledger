"use client";
import { X } from "lucide-react";
import { Card } from "@/components/ui/card";

/** Shared centered modal shell (overlay + card + close). */
export function Modal({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <Card className={`w-full ${wide ? "max-w-lg" : "max-w-md"} p-6`}>
        <div onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-2xl font-semibold text-ink">{title}</h3>
            <button onClick={onClose} className="text-muted hover:text-ink" aria-label="Close"><X size={18} /></button>
          </div>
          <div className="mt-5">{children}</div>
        </div>
      </Card>
    </div>
  );
}

/** Labelled form field wrapper matching the app's input styling. */
export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-wider text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

/** Cancel / submit footer for modal forms. */
export function ModalActions({ onCancel, submitLabel, busy, disabled }: { onCancel: () => void; submitLabel: string; busy?: boolean; disabled?: boolean }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button type="button" onClick={onCancel} className="rounded-btn border border-border px-4 py-2.5 text-sm text-ink hover:bg-tag/40">Cancel</button>
      <button type="submit" disabled={busy || disabled} className="rounded-btn bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-deep disabled:opacity-50">{busy ? "Saving…" : submitLabel}</button>
    </div>
  );
}
