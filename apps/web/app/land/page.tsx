import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Money } from "@/components/ui/money";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Th, Td, num, usd, pct } from "@/components/ui/table";
import { prisma } from "@fl/db";
import { getDemoFarmId } from "@/lib/data";
import { getFinancialSnapshot } from "@/lib/snapshot";
import { enterpriseStatements, incomeStatement, sumCents } from "@fl/core";
import { fmtDate } from "@/lib/format";
import { Map as MapIcon } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function LandPage() {
  const farmId = await getDemoFarmId();
  const snap = await getFinancialSnapshot(farmId);
  const [parcels, enterprises, landAssets] = await Promise.all([
    prisma.landParcel.findMany({ where: { farmId }, orderBy: { acres: "desc" } }),
    prisma.enterprise.findMany({ where: { farmId } }),
    prisma.asset.findMany({ where: { farmId, category: "Land" }, orderBy: { purchasedAt: "asc" } }),
  ]);
  if (parcels.length === 0 && landAssets.length === 0) {
    return (<><PageHeader title="Land" /><EmptyState icon={<MapIcon size={22} />} title="No Land Records" /></>);
  }
  const name = new Map(enterprises.map((e) => [e.id, e.name]));
  const { bs, ttm, asOf, ratios } = snap;
  const st = enterpriseStatements(snap.rows, ttm.from, ttm.to);
  // Entries tagged to a field give that field its own results; the rest share their enterprise's per acre.
  const tagged = await prisma.transaction.findMany({ where: { farmId, landParcelId: { not: null }, entryType: "ledger", date: { gt: ttm.from, lte: ttm.to }, account: { section: { in: ["REV", "COP", "OVH"] } } }, select: { landParcelId: true, amountCents: true, account: { select: { section: true } } } });
  const byField = new Map<string, { rev: bigint; net: bigint }>();
  for (const t of tagged) { const x = byField.get(t.landParcelId!) ?? { rev: 0n, net: 0n }; if (t.account.section === "REV") x.rev += t.amountCents; x.net += t.amountCents; byField.set(t.landParcelId!, x); }
  const isTtm = incomeStatement(snap.rows, ttm.from, ttm.to);
  const acresByEnt = new Map<string, number>();
  for (const p of parcels) if (p.enterpriseId) acresByEnt.set(p.enterpriseId, (acresByEnt.get(p.enterpriseId) ?? 0) + Number(p.acres));
  const ttmSum = (codes: string[]) => sumCents(snap.rows.filter((r) => codes.includes(r.accountCode) && r.date > ttm.from && r.date <= ttm.to).map((r) => r.amountCents));
  const propertyTax = -ttmSum(["6020"]);
  const leaseIncome = ttmSum(["4100", "4110"]);
  const totalAcres = parcels.reduce((a, p) => a + Number(p.acres), 0);
  // What the operation earned before interest and owner labor, measured against the land base at market.
  const earned = isTtm.netFarmIncomeCents + isTtm.interestCents - ratios.ownerLaborCents;
  const landReturn = bs.landMarketCents > 0n ? Number(earned) / Number(bs.landMarketCents) : null;

  return (
    <>
      <PageHeader title="Land" subtitle={`As of ${fmtDate(asOf)} · trailing 12 months`} />
      <div className="mb-6 grid grid-cols-2 gap-5 xl:grid-cols-5">
        <StatCard label="Acres" value={num(totalAcres)} sub={`${parcels.length} parcel${parcels.length === 1 ? "" : "s"}`} />
        <StatCard label="Land at Cost" value={<Money cents={bs.landCents} />} sub={`${landAssets.length} tract${landAssets.length === 1 ? "" : "s"}`} />
        <StatCard label="Land at Market" value={<Money cents={bs.landMarketCents} />} sub={totalAcres ? `${usd(Number(bs.landMarketCents) / 100 / totalAcres, 0)}/ac` : undefined} variant="mint" />
        <StatCard label="Land Debt" value={<Money cents={bs.landLoansCents} />} sub="Non-current land loans" />
        <StatCard label="Return on Land" value={pct(landReturn)} sub="Earnings / land at market" variant={landReturn != null && landReturn < 0.02 ? "cream" : "default"} />
      </div>

      <Table minWidth={900}>
        <thead><tr><Th>Parcel</Th><Th right>Acres</Th><Th>Use</Th><Th>Tenure</Th><Th>Enterprise</Th><Th right>Revenue/Ac</Th><Th right>Net/Ac</Th></tr></thead>
        <tbody>
          {parcels.map((p) => {
            const f = byField.get(p.id);
            const e = p.enterpriseId ? st.get(p.enterpriseId) : undefined;
            const s = f ? { revenueCents: f.rev, netIncomeOperatingCents: f.net } : e;
            const ac = f ? Number(p.acres) : p.enterpriseId ? acresByEnt.get(p.enterpriseId) ?? 0 : 0;
            return (
              <tr key={p.id} className="border-t border-border">
                <Td className="max-w-[320px]"><span className="font-medium">{p.name}</span>{f && <span className="block text-xs text-muted">Field entries</span>}</Td>
                <Td right>{num(Number(p.acres), Number(p.acres) % 1 ? 1 : 0)}</Td>
                <Td muted className="max-w-[260px]">{p.use ?? "–"}</Td>
                <Td muted>{p.tenure ?? "–"}</Td>
                <Td muted className="max-w-[200px] truncate" title={name.get(p.enterpriseId ?? "")}>{name.get(p.enterpriseId ?? "") ?? "–"}</Td>
                <Td right>{s && ac ? usd(Number(s.revenueCents) / 100 / ac, 0) : "–"}</Td>
                <Td right className={s && s.netIncomeOperatingCents < 0n ? "text-negative" : ""}>{s && ac ? usd(Number(s.netIncomeOperatingCents) / 100 / ac, 0) : "–"}</Td>
              </tr>
            );
          })}
        </tbody>
      </Table>

      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
        <StatCard label="Property Tax" value={<Money cents={propertyTax} />} sub={totalAcres ? `${usd(Number(propertyTax) / 100 / totalAcres)}/ac` : undefined} />
        <StatCard label="Lease Income" value={<Money cents={leaseIncome} />} sub={totalAcres ? `${usd(Number(leaseIncome) / 100 / totalAcres)}/ac across all acres` : undefined} />
      </div>
    </>
  );
}
