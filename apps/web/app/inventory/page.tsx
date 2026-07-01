import { PageHeader } from "@/components/ui/page-header";
import { PrimaryButton } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { Card } from "@/components/ui/card";
import { CategoryPill } from "@/components/ui/category-pill";
import { Money } from "@/components/ui/money";
import { ValuationDetail } from "@/components/valuation-detail";
import { getDemoFarmId } from "@/lib/data";
import { getValuedInventory } from "@/lib/valuation";
import { formatCentsDisplay, sumCents } from "@fl/core";
import { Plus, Search, Boxes, MapPin, Beef, Wheat, Tractor } from "lucide-react";

export const dynamic = "force-dynamic";

const fmtQty = (q: unknown) => Number(q).toLocaleString();
const singular = (u: string) => (u.endsWith("s") ? u.slice(0, -1) : u);

export default async function InventoryPage() {
  const farmId = await getDemoFarmId();
  const valued = await getValuedInventory(farmId);

  const catValue = (cats: string[]) => sumCents(valued.filter((v) => cats.includes(v.item.category)).map((v) => v.valuation.valueCents));
  const totalValue = sumCents(valued.map((v) => v.valuation.valueCents));
  const livestockValue = catValue(["LIVESTOCK"]);
  const cropsFeedValue = catValue(["CROPS", "FEED"]);
  const equipmentValue = catValue(["EQUIPMENT", "SUPPLIES"]);

  return (
    <>
      <PageHeader
        title="Inventory"
        subtitle="Manage livestock, crops, equipment, and supplies."
        action={<PrimaryButton><Plus size={16} /> Add Item</PrimaryButton>}
      />

      <div className="mb-6 grid grid-cols-2 gap-5 lg:grid-cols-4">
        <StatCard label="Total Inventory Value" value={<Money cents={totalValue} className="text-white" />} sub={`${valued.length} active lots/items`} variant="primary" icon={<Boxes size={18} className="text-white/80" />} />
        <StatCard label="Livestock" value={<Money cents={livestockValue} />} sub="Head at market value" icon={<Beef size={18} className="text-muted" />} />
        <StatCard label="Crops & Feed" value={<Money cents={cropsFeedValue} />} sub="Stored production" icon={<Wheat size={18} className="text-muted" />} />
        <StatCard label="Equipment" value={<Money cents={equipmentValue} />} sub="Depreciated book value" icon={<Tractor size={18} className="text-muted" />} />
      </div>

      <Card className="mb-6 flex items-center gap-3 px-4 py-3">
        <Search size={18} className="text-muted" />
        <input className="w-full bg-transparent text-sm outline-none placeholder:text-muted" placeholder="Search inventory..." />
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {valued.map(({ item, valuation, marketPriceCents, marketSource }) => {
          const equipment = valuation.source === "depreciated";
          return (
            <Card key={item.id} className="flex flex-col p-5">
              <CategoryPill>{item.category}</CategoryPill>
              <h3 className="mt-3 font-serif text-xl font-semibold text-ink">{item.name}</h3>
              <div className="mt-3 space-y-1.5 text-sm text-muted">
                <p className="flex items-center gap-2"><Boxes size={15} /> {fmtQty(item.quantity)} {item.unit}</p>
                {item.location && <p className="flex items-center gap-2"><MapPin size={15} /> {item.location}</p>}
              </div>

              {/* valuation basis line */}
              <div className="mt-3 flex items-center gap-2 text-xs">
                {equipment ? (
                  <span className="text-muted">Cost <span className="text-ink">{formatCentsDisplay(item.costBasisCents ?? 0n)}</span> · book value</span>
                ) : valuation.source === "override" ? (
                  <>
                    <span className="text-muted">{formatCentsDisplay(valuation.unitPriceCents ?? 0n)}/{singular(item.unit)}</span>
                    <span className="rounded-pill bg-tag px-2 py-0.5 uppercase tracking-wide text-brown">manual</span>
                  </>
                ) : valuation.source === "market" ? (
                  <>
                    <span className="text-muted">{formatCentsDisplay(marketPriceCents ?? 0n)}/{singular(item.unit)}</span>
                    <span className="rounded-pill bg-mint px-2 py-0.5 uppercase tracking-wide text-positive">{marketSource ?? "market"}</span>
                  </>
                ) : (
                  <span className="text-muted">unvalued</span>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                <span className="text-xs uppercase tracking-wider text-muted">{equipment ? "Book Value" : "Est. Value"}</span>
                <span className="font-serif text-lg font-bold text-ink"><Money cents={valuation.valueCents} /></span>
              </div>

              <ValuationDetail
                farmId={farmId}
                id={item.id}
                name={item.name}
                category={item.category}
                unit={item.unit}
                quantity={String(item.quantity)}
                source={valuation.source}
                marketSource={marketSource}
                valueCents={valuation.valueCents.toString()}
                unitPriceCents={valuation.unitPriceCents?.toString() ?? null}
                overrideCents={item.unitValueCents?.toString() ?? null}
                costBasisCents={valuation.costBasisCents.toString()}
                depreciation={valuation.depreciation ? {
                  annualCents: valuation.depreciation.annualCents.toString(),
                  accumulatedCents: valuation.depreciation.accumulatedCents.toString(),
                  bookValueCents: valuation.depreciation.bookValueCents.toString(),
                  elapsedDays: valuation.depreciation.elapsedDays,
                } : null}
              />
            </Card>
          );
        })}
      </div>
    </>
  );
}
