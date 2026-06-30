"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { toCents, formatCentsDisplay } from "@fl/core";
import { X, SlidersHorizontal } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type DetailProps = {
  farmId: string;
  id: string;
  name: string;
  category: string;
  unit: string;
  quantity: string;
  source: "depreciated" | "override" | "market" | "none";
  marketSource: string | null;
  valueCents: string;
  unitPriceCents: string | null;
  overrideCents: string | null;
  costBasisCents: string;
  depreciation: { annualCents: string; accumulatedCents: string; bookValueCents: string; elapsedDays: number } | null;
};

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between py-1.5 text-sm">
    <span className="text-muted">{label}</span>
    <span className="font-medium text-ink">{children}</span>
  </div>
);

export function ValuationDetail(p: DetailProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [override, setOverride] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply(clear: boolean) {
    setError(null);
    try {
      const body = clear ? { unitValueCents: null } : { unitValueCents: toCents(override).toString() };
      setBusy(true);
      const res = await fetch(`${API}/farms/${p.farmId}/inventory/${p.id}`, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? "Update failed");
      setOpen(false); setOverride(""); router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid value");
    } finally {
      setBusy(false);
    }
  }

  const unitSingular = p.unit.endsWith("s") ? p.unit.slice(0, -1) : p.unit;

  return (
    <>
      <button onClick={() => setOpen(true)} className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink">
        <SlidersHorizontal size={13} /> Valuation detail
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setOpen(false)}>
          <Card className="w-full max-w-md p-6" >
            <div onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="font-serif text-2xl font-semibold text-ink">{p.name}</h3>
                <button onClick={() => setOpen(false)} className="text-muted hover:text-ink"><X size={18} /></button>
              </div>

              <div className="mt-4 divide-y divide-border">
                <Row label="Category">{p.category[0] + p.category.slice(1).toLowerCase()}</Row>
                <Row label="Quantity">{Number(p.quantity).toLocaleString()} {p.unit}</Row>
                <Row label="Valuation method">
                  <span className="rounded-pill bg-tag px-2 py-0.5 text-xs uppercase tracking-wide text-brown">
                    {p.source === "market" ? (p.marketSource ?? "market") : p.source}
                  </span>
                </Row>
                {p.unitPriceCents && p.source !== "depreciated" && (
                  <Row label="Effective price">{formatCentsDisplay(BigInt(p.unitPriceCents))} / {unitSingular}</Row>
                )}
                <Row label="Cost basis (tax)"><Money cents={p.costBasisCents} /></Row>

                {p.depreciation && (
                  <>
                    <Row label="Annual depreciation"><Money cents={p.depreciation.annualCents} /></Row>
                    <Row label="Accumulated">−<Money cents={p.depreciation.accumulatedCents} /></Row>
                    <Row label="Years elapsed">{(p.depreciation.elapsedDays / 365).toFixed(1)}</Row>
                  </>
                )}
                <Row label={p.source === "depreciated" ? "Book value" : "Market value"}>
                  <span className="font-serif text-lg font-bold"><Money cents={p.valueCents} /></span>
                </Row>
              </div>

              <div className="mt-5 rounded-btn bg-surface-sunken p-4">
                <p className="text-xs uppercase tracking-wider text-muted">Manual override</p>
                <p className="mt-1 text-xs text-muted">Set a per-{unitSingular} value to override the {p.source === "depreciated" ? "book value" : "market price"}.</p>
                <div className="mt-3 flex gap-2">
                  <input value={override} onChange={(e) => setOverride(e.target.value)} inputMode="decimal" className="input" placeholder={p.overrideCents ? formatCentsDisplay(BigInt(p.overrideCents)).replace("$", "") : "0.00"} />
                  <button onClick={() => apply(false)} disabled={busy || !override} className="whitespace-nowrap rounded-btn bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-deep disabled:opacity-50">Apply</button>
                  {p.overrideCents && <button onClick={() => apply(true)} disabled={busy} className="whitespace-nowrap rounded-btn border border-border px-3 py-2 text-sm text-ink hover:bg-tag/40">Clear</button>}
                </div>
                {error && <p className="mt-2 text-sm text-negative">{error}</p>}
              </div>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
