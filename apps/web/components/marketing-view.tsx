import clsx from "clsx";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Table, Th, Td, num, usd } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { ContractButton, type ContractVM } from "@/components/contract-form";
import { CONTRACT_TYPES } from "@/lib/contracts";
import { prisma, loadCommodityExposure } from "@fl/db";
import { fmtDate } from "@/lib/format";
import { FileSignature } from "lucide-react";

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** Commodity exposure (spec §23): production vs. sold, contracted, and unpriced, plus the contracts. */
export async function MarketingView({ farmId, canEdit }: { farmId: string; canEdit: boolean }) {
  const [x, raw] = await Promise.all([
    loadCommodityExposure(prisma, farmId),
    prisma.marketingContract.findMany({ where: { farmId }, orderBy: [{ cropYear: "desc" }, { deliveryStart: "asc" }] }),
  ]);
  const contracts: ContractVM[] = raw.map((c) => ({
    id: c.id, number: c.number, commodity: c.commodity, cropYear: c.cropYear, type: c.type, quantity: Number(c.quantity), unit: c.unit,
    price: c.price == null ? null : Number(c.price), basis: c.basis == null ? null : Number(c.basis), buyer: c.buyer,
    deliveryStart: iso(c.deliveryStart), deliveryEnd: iso(c.deliveryEnd), delivered: Number(c.delivered), status: c.status, notes: c.notes,
  }));
  const commodities = [...new Set(x.rows.map((r) => r.commodity))];
  const year = x.asOf.getUTCFullYear();
  const current = x.rows.filter((r) => r.cropYear === year && r.expected > 0);
  const unpricedValue = current.reduce((a, r) => a + (r.unpricedValue ?? 0), 0);
  const worst = [...current].sort((a, b) => (b.exposedPct ?? 0) - (a.exposedPct ?? 0))[0];
  const openContracts = contracts.filter((c) => c.status === "open");
  const contractedValue = openContracts.reduce((a, c) => a + (c.price ?? 0) * Math.max(0, c.quantity - c.delivered), 0);

  return (
    <>
      <div className="mb-6 grid grid-cols-1 gap-5 sm:grid-cols-3">
        <StatCard label={`Unpriced ${year} Crop`} value={usd(unpricedValue, 0)} sub="At current market" variant="cream" />
        <StatCard label="Most Exposed" value={worst ? `${Math.round((worst.exposedPct ?? 0) * 100)}%` : "–"} sub={worst ? `of ${worst.commodity.toLowerCase()} unpriced` : undefined} />
        <StatCard label="Open Contracts" value={usd(contractedValue, 0)} sub={`${openContracts.length} contract${openContracts.length === 1 ? "" : "s"}`} />
      </div>

      {x.rows.length > 0 && (
        <Table minWidth={900}>
          <thead><tr><Th>Commodity</Th><Th right>Crop Year</Th><Th right>Expected</Th><Th right>Sold</Th><Th right>Contracted</Th><Th right>Unpriced</Th><Th right>Exposed</Th><Th right>Market</Th><Th right>Unpriced Value</Th><Th>Next Delivery</Th></tr></thead>
          <tbody>
            {x.rows.map((r) => (
              <tr key={`${r.commodity}-${r.cropYear}`} className="border-t border-border">
                <Td strong>{r.commodity}</Td>
                <Td right muted>{r.cropYear}</Td>
                <Td right>{num(r.expected)} <span className="text-xs text-muted">{r.unit}</span></Td>
                <Td right>{num(r.sold)}</Td>
                <Td right>{num(r.contracted)}{r.avgContractPrice != null && <span className="block text-xs text-muted">{usd(r.avgContractPrice)}</span>}</Td>
                <Td right>{num(r.unpriced)}</Td>
                <Td right strong className={clsx(r.exposedPct != null && r.exposedPct > 0.4 && "text-rust")}>{r.exposedPct == null ? "–" : `${Math.round(r.exposedPct * 100)}%`}</Td>
                <Td right muted>{r.marketPrice == null ? "–" : usd(r.marketPrice)}</Td>
                <Td right>{r.unpricedValue == null ? "–" : usd(r.unpricedValue, 0)}</Td>
                <Td muted>{r.nextDelivery ? fmtDate(r.nextDelivery) : "–"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <div className="mt-8 mb-4 flex items-center justify-between">
        <h3 className="font-serif text-xl font-semibold text-ink">Contracts</h3>
        {canEdit && <ContractButton farmId={farmId} commodities={commodities} />}
      </div>
      {contracts.length === 0 ? <EmptyState icon={<FileSignature size={22} />} title="No Contracts" /> : (
        <Card className="overflow-x-auto p-2 sm:p-4">
          <table className="w-full min-w-[860px] text-sm">
            <thead><tr><Th>Contract</Th><Th>Commodity</Th><Th>Type</Th><Th>Buyer</Th><Th right>Quantity</Th><Th right>Price</Th><Th right>Delivered</Th><Th>Delivery</Th><Th>Status</Th>{canEdit && <Th />}</tr></thead>
            <tbody>
              {contracts.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <Td strong className="whitespace-nowrap">{c.number ?? "–"}</Td>
                  <Td>{c.commodity} <span className="text-xs text-muted">{c.cropYear}</span></Td>
                  <Td muted>{CONTRACT_TYPES[c.type] ?? c.type}</Td>
                  <Td muted>{c.buyer ?? "–"}</Td>
                  <Td right>{num(c.quantity)} <span className="text-xs text-muted">{c.unit}</span></Td>
                  <Td right>{c.price == null ? (c.basis != null ? `Basis ${c.basis >= 0 ? "+" : ""}${c.basis.toFixed(2)}` : "Unpriced") : usd(c.price)}</Td>
                  <Td right muted>{num(c.delivered)}</Td>
                  <Td muted className="whitespace-nowrap">{c.deliveryStart ? `${fmtDate(new Date(c.deliveryStart))}${c.deliveryEnd ? ` – ${fmtDate(new Date(c.deliveryEnd))}` : ""}` : "–"}</Td>
                  <Td><span className={clsx("rounded-pill px-2.5 py-0.5 text-xs font-medium", c.status === "open" ? "bg-cream-tint text-ink" : c.status === "delivered" ? "bg-mint text-positive" : "bg-tag text-muted")}>{c.status[0]!.toUpperCase() + c.status.slice(1)}</span></Td>
                  {canEdit && <Td><ContractButton farmId={farmId} contract={c} commodities={commodities} /></Td>}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
