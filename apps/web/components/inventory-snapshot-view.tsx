import { Card } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { StatCard } from "@/components/ui/stat-card";
import { LinkTabs } from "@/components/ui/link-tabs";
import { Table, Th, Td, num } from "@/components/ui/table";
import { prisma } from "@fl/db";
import { inventoryExposure, sumCents } from "@fl/core";
import { fmtDate } from "@/lib/format";
import { Beef, Wheat, Boxes, TrendingDown } from "lucide-react";

const LIVESTOCK = (c: string) => c.startsWith("Livestock");
const CROPS = (c: string) => c.startsWith("Crops") || c === "Growing crops";

/** Inventory from month-end snapshots: quantity, cost basis, market value, exposure. */
export async function InventorySnapshotView({ farmId, asOf, shock }: { farmId: string; asOf: Date; shock: number }) {
  const [snaps, seasons] = await Promise.all([
    prisma.inventorySnapshot.findMany({ where: { farmId, asOf }, include: {}, orderBy: [{ category: "asc" }, { item: "asc" }] }),
    prisma.cropSeason.findMany({ where: { farmId, year: asOf.getUTCFullYear() } }),
  ]);
  const ents = new Map((await prisma.enterprise.findMany({ where: { farmId } })).map((e) => [e.id, e.name]));
  const value = (s: (typeof snaps)[number]) => (s.bsValuation === "cost" ? s.costBasisCents : s.marketValueCents);
  const total = sumCents(snaps.map(value));
  const live = sumCents(snaps.filter((s) => LIVESTOCK(s.category)).map(value));
  const crops = sumCents(snaps.filter((s) => CROPS(s.category) || s.category.startsWith("Feed")).map(value));
  const marketed = snaps.filter((s) => s.bsValuation === "market");
  const exposure = inventoryExposure(marketed.map((s) => ({ label: s.item, marketValueCents: s.marketValueCents })), -shock);
  const exposureTotal = sumCents(exposure.map((e) => e.shockCents));

  // Commodity exposure for this year's crops: production vs. sold vs. still unpriced in storage.
  const production = seasons.filter((s) => s.totalProduction != null || (s.expectedYield != null)).map((s) => {
    const prod = Number(s.totalProduction ?? Number(s.expectedYield ?? 0) * Number(s.acres));
    const sold = Number(s.qtySold ?? 0);
    return { crop: s.crop, unit: (s.yieldUnit ?? "").replace("/ac", ""), prod, sold, open: Math.max(0, prod - sold), harvested: s.totalProduction != null };
  });
  const byCrop = new Map<string, { crop: string; unit: string; prod: number; sold: number; open: number }>();
  for (const p of production) { const c = byCrop.get(p.crop) ?? { crop: p.crop, unit: p.unit, prod: 0, sold: 0, open: 0 }; c.prod += p.prod; c.sold += p.sold; c.open += p.open; byCrop.set(p.crop, c); }

  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-5 xl:grid-cols-4">
        <StatCard label="Inventory" value={<Money cents={total} className="text-white" />} sub={`As of ${fmtDate(asOf)}`} variant="primary" icon={<Boxes size={18} className="text-white/80" />} />
        {live > 0n
          ? <StatCard label="Livestock" value={<Money cents={live} />} sub="At market" icon={<Beef size={18} className="text-muted" />} />
          : <StatCard label="Growing Crops" value={<Money cents={sumCents(snaps.filter((s) => s.category === "Growing crops").map(value))} />} sub="At cost" icon={<Wheat size={18} className="text-muted" />} />}
        <StatCard label="Crops & Feed" value={<Money cents={crops} />} icon={<Wheat size={18} className="text-muted" />} />
        <StatCard label={`If Prices Fall ${Math.round(shock * 100)}%`} value={<Money cents={exposureTotal} />} sub="Change in inventory value" variant="cream" icon={<TrendingDown size={18} className="text-rust" />} />
      </div>

      <div className="mb-4 flex items-center gap-3 text-sm text-muted">
        Price Move <LinkTabs value={String(Math.round(shock * 100))} options={[10, 15, 20, 30].map((p) => ({ value: String(p), label: `-${p}%`, href: `/inventory?shock=${p}` }))} />
      </div>

      <Table minWidth={980}>
        <thead><tr><Th>Item</Th><Th>Category</Th><Th>Enterprise</Th><Th right>Quantity</Th><Th right>Cost Basis</Th><Th right>Market Value</Th><Th>Carried At</Th><Th>Use / Sale</Th><Th right>At -{Math.round(shock * 100)}%</Th></tr></thead>
        <tbody>
          {snaps.map((s) => (
            <tr key={s.id} className="border-t border-border">
              <Td className="max-w-[260px]"><span className="font-medium">{s.item}</span>{s.location && <p className="text-xs text-muted">{s.location}</p>}</Td>
              <Td muted>{s.category}</Td>
              <Td muted className="max-w-[180px] truncate" title={ents.get(s.enterpriseId ?? "") ?? undefined}>{ents.get(s.enterpriseId ?? "") ?? "–"}</Td>
              <Td right>{num(Number(s.quantity), Number(s.quantity) % 1 ? 1 : 0)} <span className="text-xs text-muted">{s.unit}</span></Td>
              <Td right><Money cents={s.costBasisCents} /></Td>
              <Td right><Money cents={s.marketValueCents} /></Td>
              <Td muted>{s.bsValuation === "cost" ? "Cost" : "Market"}</Td>
              <Td muted>{s.expectedUseOrSale ?? "–"}</Td>
              <Td right muted>{s.bsValuation === "market" ? <Money cents={BigInt(Math.round(-Number(s.marketValueCents) * shock))} /> : "–"}</Td>
            </tr>
          ))}
        </tbody>
      </Table>

      {byCrop.size > 0 && (
        <Card className="mt-6 p-6">
          <h3 className="font-serif text-lg font-semibold text-ink">Crop Marketing {asOf.getUTCFullYear()}</h3>
          <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[560px] text-sm">
            <thead><tr><Th>Crop</Th><Th right>Production</Th><Th right>Sold</Th><Th right>Unpriced</Th><Th right>Exposed</Th></tr></thead>
            <tbody>
              {[...byCrop.values()].map((c) => (
                <tr key={c.crop} className="border-t border-border">
                  <Td strong>{c.crop}</Td><Td right>{num(c.prod)} <span className="text-xs text-muted">{c.unit}</span></Td><Td right>{num(c.sold)}</Td><Td right>{num(c.open)}</Td>
                  <Td right strong className={c.prod && c.open / c.prod > 0.4 ? "text-rust" : ""}>{c.prod ? `${Math.round((c.open / c.prod) * 100)}%` : "–"}</Td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </Card>
      )}
    </>
  );
}
