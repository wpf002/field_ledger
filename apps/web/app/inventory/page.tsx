import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Money } from "@/components/ui/money";
import { InventoryList, type InventoryVM } from "@/components/inventory-list";
import { AddInventoryButton } from "@/components/add-inventory-button";
import { getDemoFarmId, getCurrentRole, canWrite } from "@/lib/data";
import { getValuedInventory } from "@/lib/valuation";
import { sumCents } from "@fl/core";
import { Boxes, Beef, Wheat, Tractor } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const farmId = await getDemoFarmId();
  const canEdit = canWrite(await getCurrentRole());
  const valued = await getValuedInventory(farmId);

  const catValue = (cats: string[]) => sumCents(valued.filter((v) => cats.includes(v.item.category)).map((v) => v.valuation.valueCents));
  const totalValue = sumCents(valued.map((v) => v.valuation.valueCents));
  const livestockValue = catValue(["LIVESTOCK"]);
  const cropsFeedValue = catValue(["CROPS", "FEED"]);
  const equipmentValue = catValue(["EQUIPMENT", "SUPPLIES"]);

  const items: InventoryVM[] = valued.map(({ item, valuation, marketPriceCents, marketSource }) => ({
    id: item.id, name: item.name, category: item.category, quantity: String(item.quantity), unit: item.unit, location: item.location,
    equipment: valuation.source === "depreciated",
    source: valuation.source,
    unitPriceCents: valuation.unitPriceCents?.toString() ?? null,
    marketPriceCents: marketPriceCents?.toString() ?? null,
    marketSource: marketSource ?? null,
    valueCents: valuation.valueCents.toString(),
    costBasisCents: valuation.costBasisCents.toString(),
    overrideCents: item.unitValueCents?.toString() ?? null,
    depreciation: valuation.depreciation ? {
      annualCents: valuation.depreciation.annualCents.toString(),
      accumulatedCents: valuation.depreciation.accumulatedCents.toString(),
      bookValueCents: valuation.depreciation.bookValueCents.toString(),
      elapsedDays: valuation.depreciation.elapsedDays,
    } : null,
  }));

  return (
    <>
      <PageHeader
        title="Inventory"
        subtitle="Manage livestock, crops, equipment, and supplies."
        action={canEdit ? <AddInventoryButton farmId={farmId} /> : undefined}
      />

      <div className="mb-6 grid grid-cols-2 gap-5 lg:grid-cols-4">
        <StatCard label="Total Inventory Value" value={<Money cents={totalValue} className="text-white" />} sub={`${valued.length} active lots/items`} variant="primary" icon={<Boxes size={18} className="text-white/80" />} />
        <StatCard label="Livestock" value={<Money cents={livestockValue} />} sub="Head at market value" icon={<Beef size={18} className="text-muted" />} />
        <StatCard label="Crops & Feed" value={<Money cents={cropsFeedValue} />} sub="Stored production" icon={<Wheat size={18} className="text-muted" />} />
        <StatCard label="Equipment" value={<Money cents={equipmentValue} />} sub="Depreciated book value" icon={<Tractor size={18} className="text-muted" />} />
      </div>

      <InventoryList farmId={farmId} items={items} />
    </>
  );
}
