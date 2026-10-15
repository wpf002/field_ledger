import clsx from "clsx";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { LinkTabs } from "@/components/ui/link-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Th, Td, usd, num, pct } from "@/components/ui/table";
import { prisma } from "@fl/db";
import { getDemoFarmId, getPlan } from "@/lib/data";
import { Upgrade } from "@/components/ui/upgrade";
import { hasFeature } from "@fl/core";
import { getEnterpriseContext, yearPeriod } from "@/lib/enterprise";
import { enterpriseStatements, cropEconomics, headEconomics, yieldNeeded, priceNeeded, breakEvenPerLb, type EnterpriseStatement } from "@fl/core";
import { Tractor } from "lucide-react";

export const dynamic = "force-dynamic";
type View = "profit" | "crops" | "livestock" | "breakeven";

export default async function EnterprisesPage({ searchParams }: { searchParams: { view?: string; year?: string } }) {
  const farmId = await getDemoFarmId();
  const ctx = await getEnterpriseContext(farmId);
  const view: View = (["crops", "livestock", "breakeven"] as const).find((v) => v === searchParams.view) ?? "profit";
  const year = ctx.years.includes(Number(searchParams.year)) ? Number(searchParams.year) : ctx.years[0]!;
  const period = yearPeriod(year, ctx.asOf);
  const href = (patch: { view?: string; year?: number }) => `/enterprises?view=${patch.view ?? view}&year=${patch.year ?? year}`;
  const ents = ctx.enterprises;
  const nameOf = new Map(ents.map((e) => [e.id, e.name]));

  if (ents.length === 0) {
    return (<><PageHeader title="Enterprises" /><EmptyState icon={<Tractor size={22} />} title="No Enterprises" /></>);
  }

  const header = (
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <LinkTabs value={view} options={[
        { value: "profit", label: "Profitability", href: href({ view: "profit" }) },
        { value: "crops", label: "Crops", href: href({ view: "crops" }) },
        { value: "livestock", label: "Livestock", href: href({ view: "livestock" }) },
        { value: "breakeven", label: "Break-Even", href: href({ view: "breakeven" }) },
      ]} />
      <LinkTabs value={String(year)} options={ctx.years.map((y) => ({ value: String(y), label: y === ctx.asOf.getUTCFullYear() && period.partial ? `${y} YTD` : String(y), href: href({ year: y }) }))} />
    </div>
  );

  let body: React.ReactNode = null;
  const unitsAllowed = hasFeature(await getPlan(), "unit_economics");
  const crops = cropEconomics(ctx.inputs.rows, ctx.cropSeasons, ctx.depreciationByEnterpriseYear).filter((c) => c.season.year === year);
  const livestock = ctx.unitCounts.filter((u) => u.year === year).map((u) => headEconomics(ctx.inputs.rows, u.enterpriseId, period.from, period.to, u.count, u.basis));

  if (view !== "profit" && !unitsAllowed) {
    body = <Upgrade feature="unit_economics" title="Unit Economics" />;
  } else if (view === "profit") {
    const st = enterpriseStatements(ctx.inputs.rows, period.from, period.to);
    const overheadEnt = ents.find((e) => e.code === "OVH" || e.type?.toLowerCase() === "overhead");
    const ovh = overheadEnt ? st.get(overheadEnt.id) : undefined;
    const pool = ovh ? -ovh.netIncomeOperatingCents : 0n; // unallocated overhead, depreciation, and interest
    const operating = ents.filter((e) => e.id !== overheadEnt?.id && !ents.some((c) => c.parentId === e.id) && st.has(e.id));
    const revBase = operating.reduce((s, e) => s + (st.get(e.id)!.revenueCents > 0n ? st.get(e.id)!.revenueCents : 0n), 0n);
    const alloc = (e: EnterpriseStatement) => (revBase > 0n && e.revenueCents > 0n ? (pool * e.revenueCents) / revBase : 0n);
    type R = { id: string; name: string; s: EnterpriseStatement; allocated: bigint; indent?: boolean; group?: boolean };
    const rows: R[] = [];
    for (const e of ents.filter((x) => !x.parentId && x.id !== overheadEnt?.id)) {
      const kids = ents.filter((c) => c.parentId === e.id);
      const own = st.get(e.id);
      if (kids.length) {
        // Parent carries shared costs; allocate them to children by revenue share in the group total.
        const parts = [own, ...kids.map((k) => st.get(k.id))].filter(Boolean) as EnterpriseStatement[];
        const g = sumStatements(parts, e.id);
        rows.push({ id: e.id, name: `${e.name.split(" - ")[0]} (All)`, s: g, allocated: kids.reduce((s, k) => s + (st.get(k.id) ? alloc(st.get(k.id)!) : 0n), 0n), group: true });
        for (const k of kids) { const ks = st.get(k.id); if (ks) rows.push({ id: k.id, name: k.name, s: ks, allocated: alloc(ks), indent: true }); }
        if (own) rows.push({ id: `${e.id}-shared`, name: "Shared Produce Costs", s: own, allocated: 0n, indent: true });
      } else if (own) rows.push({ id: e.id, name: e.name, s: own, allocated: alloc(own) });
    }
    const unassigned = st.get(null);
    const total = sumStatements([...st.values()], "total");
    const after = (r: R) => r.s.netIncomeOperatingCents - r.allocated;
    const top = rows.filter((r) => !r.group && !r.id.endsWith("-shared"));
    const best = top.reduce<R | null>((b, r) => (!b || after(r) > after(b) ? r : b), null);
    const worst = top.reduce<R | null>((b, r) => (!b || after(r) < after(b) ? r : b), null);
    body = (
      <>
        {best && worst && best !== worst && (
          <div className="mb-5 grid gap-4 sm:grid-cols-2">
            <Card className="p-5"><p className="text-xs uppercase tracking-wider text-muted">Most Profitable</p><p className="mt-1 font-serif text-xl font-semibold text-ink">{best.name}</p><p className="text-sm text-positive"><Money cents={after(best)} /> after overhead</p></Card>
            <Card className="p-5"><p className="text-xs uppercase tracking-wider text-muted">Least Profitable</p><p className="mt-1 font-serif text-xl font-semibold text-ink">{worst.name}</p><p className="text-sm"><Money cents={after(worst)} /> after overhead</p></Card>
          </div>
        )}
        <Table minWidth={1120}>
          <thead><tr><Th>Enterprise</Th><Th right>Revenue</Th><Th right>Transfers</Th><Th right>Direct Costs</Th><Th right>Gross Profit</Th><Th right>Margin</Th><Th right>Overhead & Dep.</Th><Th right>Net (Operating)</Th><Th right>Allocated Overhead</Th><Th right>Net After Overhead</Th><Th right>Net Farm Income</Th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={clsx("border-t border-border", r.group && "bg-surface-sunken/60")}>
                <Td className={clsx("min-w-[240px]", r.indent && "pl-8 text-muted", r.group && "font-semibold")}>{r.name}</Td>
                <Td right><Money cents={r.s.revenueCents} /></Td>
                <Td right muted><Money cents={r.s.transfersCents} /></Td>
                <Td right><Money cents={r.s.copCents} /></Td>
                <Td right><Money cents={r.s.grossProfitCents} /></Td>
                <Td right muted>{pct(r.s.grossMarginPct)}</Td>
                <Td right><Money cents={r.s.overheadCents + r.s.depreciationCents} /></Td>
                <Td right><Money cents={r.s.netIncomeOperatingCents} /></Td>
                <Td right muted>{r.indent && r.allocated === 0n ? "–" : <Money cents={-r.allocated} />}</Td>
                <Td right strong><Money cents={after(r)} /></Td>
                <Td right><Money cents={r.s.netFarmIncomeCents} /></Td>
              </tr>
            ))}
            {ovh && (
              <tr className="border-t border-border">
                <Td muted>{nameOf.get(overheadEnt!.id)}</Td><Td right><Money cents={ovh.revenueCents} /></Td><Td right muted>–</Td><Td right><Money cents={ovh.copCents} /></Td><Td right>–</Td><Td right muted>–</Td>
                <Td right><Money cents={ovh.overheadCents + ovh.depreciationCents} /></Td><Td right><Money cents={ovh.netIncomeOperatingCents} /></Td><Td right muted><Money cents={pool} /></Td><Td right>–</Td><Td right><Money cents={ovh.netFarmIncomeCents} /></Td>
              </tr>
            )}
            {unassigned && (
              <tr className="border-t border-border"><Td muted>Unassigned</Td><Td right><Money cents={unassigned.revenueCents} /></Td><Td right muted>–</Td><Td right><Money cents={unassigned.copCents} /></Td><Td right><Money cents={unassigned.grossProfitCents} /></Td><Td right muted>–</Td><Td right><Money cents={unassigned.overheadCents + unassigned.depreciationCents} /></Td><Td right><Money cents={unassigned.netIncomeOperatingCents} /></Td><Td right muted>–</Td><Td right><Money cents={unassigned.netIncomeOperatingCents} /></Td><Td right><Money cents={unassigned.netFarmIncomeCents} /></Td></tr>
            )}
            <tr className="border-t-2 border-border font-semibold">
              <Td strong>Total</Td><Td right><Money cents={total.revenueCents} /></Td><Td right muted><Money cents={total.transfersCents} /></Td><Td right><Money cents={total.copCents} /></Td>
              <Td right><Money cents={total.grossProfitCents} /></Td><Td right muted>{pct(total.grossMarginPct)}</Td><Td right><Money cents={total.overheadCents + total.depreciationCents} /></Td>
              <Td right><Money cents={total.netIncomeOperatingCents} /></Td><Td right muted>–</Td><Td right><Money cents={total.netIncomeOperatingCents} /></Td><Td right><Money cents={total.netFarmIncomeCents} /></Td>
            </tr>
          </tbody>
        </Table>
      </>
    );
  } else if (view === "crops") {
    body = crops.length === 0 ? <EmptyState icon={<Tractor size={22} />} title={`No Crop Seasons in ${year}`} /> : (
      <Table minWidth={1300}>
        <thead><tr>
          <Th>Crop</Th><Th right>Acres</Th><Th right>Yield</Th><Th right>Price</Th><Th right>Revenue/Ac</Th>
          <Th right>Seed</Th><Th right>Fert.</Th><Th right>Chem.</Th><Th right>Fuel</Th><Th right>Custom</Th><Th right>Irrig.</Th><Th right>Repairs</Th><Th right>Ins.</Th><Th right>Other</Th>
          <Th right>Dep.</Th><Th right>Shared</Th><Th right>Cost/Ac</Th><Th right>Profit/Ac</Th><Th right>BE Yield</Th><Th right>BE Price</Th>
        </tr></thead>
        <tbody>
          {crops.map((c) => {
            const p = c.perAcre;
            const unit = (c.season.yieldUnit ?? "").replace("/ac", "");
            return (
              <tr key={c.season.id} className="border-t border-border">
                <Td><span className="font-medium">{c.season.crop}</span>{(ctx.cropSeasons.find((s) => s.id === c.season.id)?.dataType ?? "Actual") !== "Actual" && <span className="ml-2 rounded-pill bg-[#F6EAC6] px-2 py-0.5 text-[11px] text-ink">Plan</span>}<p className="text-xs text-muted">{nameOf.get(c.season.enterpriseId ?? "") ?? ""}</p></Td>
                <Td right>{num(c.season.acres, 1)}</Td>
                <Td right>{num(c.season.actualYield, 1)} <span className="text-xs text-muted">{unit}</span></Td>
                <Td right>{usd(c.season.actualAvgPrice, c.season.actualAvgPrice != null && c.season.actualAvgPrice < 2 ? 3 : 2)}</Td>
                <Td right>{usd(p.revenue)}</Td>
                {(["seed", "fertilizer", "chemical", "fuel", "contractor", "irrigation", "repairs", "cropInsurance", "otherDirect"] as const).map((k) => <Td key={k} right muted>{p[k] ? usd(p[k], 0) : "–"}</Td>)}
                <Td right muted>{p.depreciation ? usd(p.depreciation, 0) : "–"}</Td>
                <Td right muted>{p.shared ? usd(p.shared, 0) : "–"}</Td>
                <Td right>{usd(p.total)}</Td>
                <Td right strong className={p.profit < 0 ? "text-negative" : "text-positive"}>{usd(p.profit)}</Td>
                <Td right>{num(c.breakEvenYield, 1)}</Td>
                <Td right>{usd(c.breakEvenPrice, c.breakEvenPrice != null && c.breakEvenPrice < 2 ? 3 : 2)}</Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    );
  } else if (view === "livestock") {
    body = livestock.length === 0 ? <EmptyState icon={<Tractor size={22} />} title={`No Livestock Counts for ${year}`} /> : (
      <Table minWidth={1200}>
        <thead><tr>
          <Th>Enterprise</Th><Th right>Head</Th><Th right>Revenue/Hd</Th><Th right>Animal Cost</Th><Th right>Feed</Th><Th right>Vet</Th><Th right>Breeding</Th>
          <Th right>Processing</Th><Th right>Labor</Th><Th right>Other</Th><Th right>Overhead</Th><Th right>Cost/Hd</Th><Th right>Profit/Hd</Th><Th right>Value Change</Th><Th right>Accrual/Hd</Th>
        </tr></thead>
        <tbody>
          {livestock.map((h) => (
            <tr key={h.enterpriseId} className="border-t border-border">
              <Td className="min-w-[220px]"><span className="font-medium">{nameOf.get(h.enterpriseId)}</span><p className="text-xs text-muted">{h.basis}</p></Td>
              <Td right>{num(h.headCount)}</Td>
              <Td right>{usd(h.perHead.revenue)}</Td>
              {(["animalCostTransfersIn", "feed", "vet", "breedingGenetics", "processing", "labor", "otherDirect", "overheadDepInterest"] as const).map((k) => <Td key={k} right muted>{h.perHead[k] ? usd(h.perHead[k]) : "–"}</Td>)}
              <Td right>{usd(h.perHead.total)}</Td>
              <Td right strong className={h.perHead.profitBeforeInventory < 0 ? "text-negative" : "text-positive"}>{usd(h.perHead.profitBeforeInventory)}</Td>
              <Td right muted>{usd(h.perHead.valueChange)}</Td>
              <Td right>{usd(h.perHead.profitAccrual)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    );
  } else {
    // Break-even: crops at actual price/yield; livestock at average sale or hanging weight.
    const sold = await prisma.animal.findMany({ where: { farmId, dispositionDate: { gt: period.from, lte: period.to }, saleWeightLb: { not: null } }, select: { saleWeightLb: true, currentClass: true, dispositionType: true } });
    const processed = await prisma.processedAnimal.findMany({ where: { farmId, processedAt: { gt: period.from, lte: period.to } }, select: { enterpriseId: true, data: true } });
    const avgW = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    const hanging = (entId: string) => avgW(processed.filter((p) => p.enterpriseId === entId).map((p) => Number((p.data as Record<string, unknown>).hanging_weight_lb)).filter((x) => x > 0));
    const liveAvg = avgW(sold.map((a) => Number(a.saleWeightLb)).filter((x) => x > 0));
    body = (
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h3 className="font-serif text-lg font-semibold text-ink">Crops</h3>
          {crops.length === 0 ? <p className="mt-3 text-sm text-muted">No Crop Seasons</p> : (
            <dl className="mt-3 divide-y divide-border text-sm">
              {crops.filter((c) => c.season.actualYield && c.season.actualAvgPrice).map((c) => {
                const y = c.season.actualYield!, pr = c.season.actualAvgPrice!, cost = c.perAcre.total;
                const unit = (c.season.yieldUnit ?? "").replace("/ac", "");
                return (
                  <div key={c.season.id} className="py-2.5">
                    <dt className="flex justify-between"><span className="font-medium text-ink">{c.season.crop} <span className="text-xs text-muted">{num(c.season.acres, 1)} ac</span></span><span className="text-muted">{usd(cost)}/ac cost</span></dt>
                    <dd className="mt-0.5 text-muted">{num(yieldNeeded(cost, pr), 1)} {unit}/ac at {usd(pr, pr < 2 ? 3 : 2)}, or {usd(priceNeeded(cost, y), 3)} at {num(y, 1)} {unit}/ac</dd>
                  </div>
                );
              })}
            </dl>
          )}
        </Card>
        <Card className="p-6">
          <h3 className="font-serif text-lg font-semibold text-ink">Livestock</h3>
          {livestock.length === 0 ? <p className="mt-3 text-sm text-muted">No Livestock Counts</p> : (
            <dl className="mt-3 divide-y divide-border text-sm">
              {livestock.map((h) => {
                const hw = hanging(h.enterpriseId);
                const perLive = liveAvg ? breakEvenPerLb(h.perHead.total, liveAvg) : null;
                return (
                  <div key={h.enterpriseId} className="py-2.5">
                    <dt className="flex justify-between"><span className="font-medium text-ink">{nameOf.get(h.enterpriseId)}</span><span className="text-muted">{usd(h.perHead.total)} per unit</span></dt>
                    <dd className="mt-0.5 text-muted">
                      {hw ? <>Hanging weight {num(hw)} lb → {usd(breakEvenPerLb(h.perHead.total, hw))}/lb to break even</> : perLive && /bull|calf|cattle|cow/i.test(h.basis ?? "") ? <>{usd(perLive)}/lb at {num(liveAvg)} lb average sale weight</> : <>Revenue {usd(h.perHead.revenue)} per unit</>}
                    </dd>
                  </div>
                );
              })}
            </dl>
          )}
        </Card>
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Enterprises" subtitle={period.partial ? `Through ${ctx.asOf.toISOString().slice(0, 10)}` : undefined} />
      {header}
      {body}
    </>
  );
}

function sumStatements(xs: EnterpriseStatement[], id: string): EnterpriseStatement {
  const keys = ["revenueCents", "copCents", "grossProfitCents", "overheadCents", "ebitdaCents", "depreciationCents", "operatingProfitCents", "interestCents", "gainCents", "netIncomeOperatingCents", "inventoryChangeCents", "livestockChangeCents", "netFarmIncomeCents", "transfersCents"] as const;
  const out = Object.fromEntries(keys.map((k) => [k, xs.reduce((s, x) => s + x[k], 0n)])) as Record<(typeof keys)[number], bigint>;
  return { ...out, grossMarginPct: out.revenueCents ? Number(out.grossProfitCents) / Number(out.revenueCents) : null, enterpriseId: id };
}
