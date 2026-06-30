import { PageHeader } from "@/components/ui/page-header";
import { PrimaryButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CategoryPill } from "@/components/ui/category-pill";
import { Money } from "@/components/ui/money";
import { prisma } from "@fl/db";
import { getDemoFarmId } from "@/lib/data";
import { Plus, Search, Boxes, MapPin } from "lucide-react";

const fmtQty = (q: unknown) => Number(q).toLocaleString();

export default async function InventoryPage() {
  const farmId = await getDemoFarmId();
  const items = await prisma.inventoryItem.findMany({ where: { farmId }, orderBy: { createdAt: "asc" } });

  return (
    <>
      <PageHeader
        title="Inventory"
        subtitle="Manage livestock, crops, equipment, and supplies."
        action={<PrimaryButton><Plus size={16} /> Add Item</PrimaryButton>}
      />

      <Card className="mb-6 flex items-center gap-3 px-4 py-3">
        <Search size={18} className="text-muted" />
        <input className="w-full bg-transparent text-sm outline-none placeholder:text-muted" placeholder="Search inventory..." />
      </Card>

      <div className="grid grid-cols-3 gap-5">
        {items.map((it) => (
          <Card key={it.id} className="flex flex-col p-5">
            <CategoryPill>{it.category}</CategoryPill>
            <h3 className="mt-3 font-serif text-xl font-semibold text-ink">{it.name}</h3>
            <div className="mt-3 space-y-1.5 text-sm text-muted">
              <p className="flex items-center gap-2"><Boxes size={15} /> {fmtQty(it.quantity)} {it.unit}</p>
              {it.location && <p className="flex items-center gap-2"><MapPin size={15} /> {it.location}</p>}
            </div>
            <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
              <span className="text-xs uppercase tracking-wider text-muted">Est. Value</span>
              <span className="font-serif text-lg font-bold text-ink"><Money cents={it.estValueCents ?? 0n} /></span>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
