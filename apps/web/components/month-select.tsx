"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Month-end picker that writes `?at=YYYY-MM` and keeps the other params. */
export function MonthSelect({ months, value, label = "As Of" }: { months: { key: string; label: string }[]; value: string; label?: string }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  return (
    <label className="inline-flex items-center gap-2 whitespace-nowrap text-sm text-muted">
      {label}
      <select value={value} className="input py-1.5"
        onChange={(e) => { const p = new URLSearchParams(params.toString()); p.set("at", e.target.value); router.push(`${path}?${p.toString()}`, { scroll: false }); }}>
        {months.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
      </select>
    </label>
  );
}
