"use client";
import { useMemo, useState } from "react";
import { Search, Boxes, MapPin } from "lucide-react";
import { formatCentsDisplay } from "@fl/core";
import { Card } from "@/components/ui/card";
import { CategoryPill } from "@/components/ui/category-pill";
import { Money } from "@/components/ui/money";
import { ValuationDetail } from "@/components/valuation-detail";

export type InventoryVM = {
  id: string; name: string; category: string; quantity: string; unit: string; location: string | null;
  equipment: boolean;
  source: "none" | "override" | "market" | "depreciated";
  unitPriceCents: string | null;
  marketPriceCents: string | null;
  marketSource: string | null;
  valueCents: string;
  costBasisCents: string;
  overrideCents: string | null;
  depreciation: { annualCents: string; accumulatedCents: string; bookValueCents: string; elapsedDays: number } | null;
};

const singular = (u: string) => (u.endsWith("s") ? u.slice(0, -1) : u);
const fmtQty = (q: string) => Number(q).toLocaleString();

export function InventoryList({ farmId, items }: { farmId: string; items: InventoryVM[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q) || (i.location ?? "").toLowerCase().includes(q));
  }, [items, query]);

  return (
    <>
      <Card className="mb-6 flex items-center gap-3 px-4 py-3">
        <Search size={18} className="text-muted" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} className="w-full bg-transparent text-sm outline-none placeholder:text-muted" placeholder="Search inventory..." />
      </Card>

      {filtered.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted">No inventory matches your search.</Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((i) => (
            <Card key={i.id} className="flex flex-col p-5">
              <CategoryPill>{i.category}</CategoryPill>
              <h3 className="mt-3 font-serif text-xl font-semibold text-ink">{i.name}</h3>
              <div className="mt-3 space-y-1.5 text-sm text-muted">
                <p className="flex items-center gap-2"><Boxes size={15} /> {fmtQty(i.quantity)} {i.unit}</p>
                {i.location && <p className="flex items-center gap-2"><MapPin size={15} /> {i.location}</p>}
              </div>

              <div className="mt-3 flex items-center gap-2 text-xs">
                {i.equipment ? (
                  <span className="text-muted">Cost <span className="text-ink">{formatCentsDisplay(BigInt(i.costBasisCents))}</span> · book value</span>
                ) : i.source === "override" ? (
                  <>
                    <span className="text-muted">{formatCentsDisplay(BigInt(i.unitPriceCents ?? "0"))}/{singular(i.unit)}</span>
                    <span className="rounded-pill bg-tag px-2 py-0.5 uppercase tracking-wide text-brown">manual</span>
                  </>
                ) : i.source === "market" ? (
                  <>
                    <span className="text-muted">{formatCentsDisplay(BigInt(i.marketPriceCents ?? "0"))}/{singular(i.unit)}</span>
                    <span className="rounded-pill bg-mint px-2 py-0.5 uppercase tracking-wide text-positive">{i.marketSource ?? "market"}</span>
                  </>
                ) : (
                  <span className="text-muted">unvalued</span>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                <span className="text-xs uppercase tracking-wider text-muted">{i.equipment ? "Book Value" : "Est. Value"}</span>
                <span className="font-serif text-lg font-bold text-ink"><Money cents={i.valueCents} /></span>
              </div>

              <ValuationDetail
                farmId={farmId} id={i.id} name={i.name} category={i.category} unit={i.unit} quantity={i.quantity}
                source={i.source} marketSource={i.marketSource} valueCents={i.valueCents} unitPriceCents={i.unitPriceCents}
                overrideCents={i.overrideCents} costBasisCents={i.costBasisCents} depreciation={i.depreciation}
              />
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
