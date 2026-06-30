"use client";
import clsx from "clsx";
export function SegmentedToggle<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex gap-1 rounded-pill bg-surface-sunken p-1">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={clsx("rounded-pill px-4 py-1.5 text-sm transition", value === o.value ? "bg-surface shadow-card text-ink" : "text-muted")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
