import clsx from "clsx";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Th, Td, num } from "@/components/ui/table";
import { prisma } from "@fl/db";
import { getDemoFarmId } from "@/lib/data";
import { getFinancialSnapshot } from "@/lib/snapshot";
import { netBookValue, repairVsReplace, equipmentPurchase, sumCents } from "@fl/core";
import { fmtDate } from "@/lib/format";
import { Tractor } from "lucide-react";

export const dynamic = "force-dynamic";
type SP = Record<string, string | undefined>;
const n = (v: string | undefined, d: number) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : d);
const c = (d: number) => BigInt(Math.round(d * 100));
const FREQ_N: Record<string, number> = { monthly: 12, quarterly: 4, semiannual: 2, annual: 1 };

function Input({ name, label, value, step = "any" }: { name: string; label: string; value: number; step?: string }) {
  return <label className="block text-sm"><span className="mb-1 block text-xs uppercase tracking-wider text-muted">{label}</span><input name={name} type="number" step={step} defaultValue={value} className="input w-full text-right" /></label>;
}

export default async function AssetsPage({ searchParams }: { searchParams: SP }) {
  const farmId = await getDemoFarmId();
  const snap = await getFinancialSnapshot(farmId);
  const asOf = snap.asOf;
  const [assets, loans] = await Promise.all([
    prisma.asset.findMany({ where: { farmId }, orderBy: [{ category: "asc" }, { purchasedAt: "desc" }] }),
    prisma.liability.findMany({ where: { farmId } }),
  ]);
  if (assets.length === 0) return (<><PageHeader title="Assets" /><EmptyState icon={<Tractor size={22} />} title="No Assets in the Register" /></>);
  const loanOf = new Map(loans.map((l) => [l.id, l]));
  const active = assets.filter((a) => !a.disposedAt || a.disposedAt > asOf);
  const rec = (a: (typeof assets)[number]) => ({ category: a.category, purchasedAt: a.purchasedAt, originalCostCents: a.originalCostCents, salvageCents: a.salvageCents, usefulLifeYears: a.usefulLifeYears, disposedAt: a.disposedAt });
  const repairs = (a: (typeof assets)[number], key: string) => BigInt((a.repairsByYear as Record<string, string> | null)?.[key] ?? "0");
  const depreciable = active.filter((a) => a.category !== "Land");
  const ttmRepairs = sumCents(active.map((a) => repairs(a, "ttm")));

  // Repair vs replace for the selected machine (defaults: the one with the most repairs).
  const candidates = depreciable.filter((a) => a.category !== "Buildings & improvements");
  const pick = candidates.find((a) => a.id === searchParams.asset) ?? [...candidates].sort((x, y) => Number(repairs(y, "ttm") - repairs(x, "ttm")))[0];
  let rvr: ReturnType<typeof repairVsReplace> | null = null;
  const lastYear = String(asOf.getUTCFullYear() - 1);
  if (pick) {
    const note = pick.liabilityId ? loanOf.get(pick.liabilityId) : undefined;
    const notePerYear = note?.paymentCents ? Number(note.paymentCents) / 100 * (FREQ_N[note.paymentFreq] ?? 1) : 0;
    const nbv = Number(netBookValue(rec(pick), asOf)) / 100;
    rvr = repairVsReplace({
      horizonYears: n(searchParams.horizon, 5),
      currentRepairsCents: c(n(searchParams.repairs, Number(repairs(pick, lastYear) || repairs(pick, "ttm")) / 100)), repairGrowthPct: n(searchParams.growth, 15) / 100,
      currentNotePaymentCents: c(notePerYear), currentNoteYearsLeft: note?.maturityAt ? Math.max(0, note.maturityAt.getUTCFullYear() - asOf.getUTCFullYear()) : 0,
      currentResaleCents: c(n(searchParams.resale, Number(pick.estCurrentValueCents ?? 0n) / 100 || nbv)),
      overhaulCents: c(n(searchParams.overhaul, 0)), repairsAfterOverhaulCents: c(n(searchParams.afterOverhaul, Number(repairs(pick, lastYear)) / 200)),
      replacementPriceCents: c(n(searchParams.newPrice, Number(pick.originalCostCents) / 100 * 1.25)), tradeInCents: c(n(searchParams.tradeIn, Number(pick.estCurrentValueCents ?? 0n) / 100 || nbv)),
      ratePct: n(searchParams.rate, 7.5), termYears: n(searchParams.term, 7), newRepairsCents: c(n(searchParams.newRepairs, 6000)), resaleAtEndCents: c(n(searchParams.endResale, 0)),
    });
  }

  // Purchase check against current repayment capacity.
  const buy = n(searchParams.buyPrice, 0) > 0 ? equipmentPurchase({
    priceCents: c(n(searchParams.buyPrice, 0)), downPaymentCents: c(n(searchParams.buyDown, 0)), tradeInCents: c(n(searchParams.buyTrade, 0)),
    ratePct: n(searchParams.buyRate, 7.5), years: n(searchParams.buyYears, 5), repaymentMarginCents: snap.ratios.repaymentMarginCents,
    savingsPerYearCents: c(n(searchParams.buySavings, 0)), usefulLifeYears: n(searchParams.buyLife, 10), salvageCents: c(n(searchParams.buySalvage, 0)),
  }) : null;

  return (
    <>
      <PageHeader title="Assets" subtitle={`As of ${fmtDate(asOf)}`} />
      <div className="mb-6 grid grid-cols-2 gap-5 xl:grid-cols-4">
        <StatCard label="Book Value" value={<Money cents={sumCents(depreciable.map((a) => netBookValue(rec(a), asOf)))} />} sub={`${depreciable.length} depreciable assets`} />
        <StatCard label="Estimated Value" value={<Money cents={sumCents(depreciable.map((a) => a.estCurrentValueCents ?? netBookValue(rec(a), asOf)))} />} sub="Current market estimate" variant="mint" />
        <StatCard label="Depreciation" value={<Money cents={sumCents(depreciable.map((a) => a.usefulLifeYears ? (a.originalCostCents - a.salvageCents) / BigInt(a.usefulLifeYears) : 0n))} />} sub="Per year" />
        <StatCard label="Repairs (12 Mo)" value={<Money cents={ttmRepairs} />} variant={ttmRepairs > 0n ? "cream" : "default"} />
      </div>

      <Table minWidth={1200}>
        <thead><tr><Th>Asset</Th><Th>Category</Th><Th>Bought</Th><Th right>Cost</Th><Th right>Book Value</Th><Th right>Est. Value</Th><Th right>Life Left</Th><Th right>Loan Balance</Th><Th right>Repairs 12 Mo</Th><Th>Usage</Th></tr></thead>
        <tbody>
          {active.map((a) => {
            const nbv = netBookValue(rec(a), asOf);
            const used = a.usefulLifeYears ? (asOf.getUTCFullYear() * 12 + asOf.getUTCMonth() - (a.purchasedAt.getUTCFullYear() * 12 + a.purchasedAt.getUTCMonth()) + 1) / 12 : null;
            const loan = a.liabilityId ? loanOf.get(a.liabilityId) : undefined;
            return (
              <tr key={a.id} className={clsx("border-t border-border", pick?.id === a.id && "bg-surface-sunken/60")}>
                <Td className="min-w-[260px]"><a href={`/assets?asset=${a.id}#rvr`} className="font-medium hover:underline">{a.description}</a>{a.maintenanceNotes && <p className="max-w-[320px] truncate text-xs text-muted" title={a.maintenanceNotes}>{a.maintenanceNotes}</p>}</Td>
                <Td muted>{a.category}</Td>
                <Td muted>{fmtDate(a.purchasedAt)}</Td>
                <Td right><Money cents={a.originalCostCents} /></Td>
                <Td right><Money cents={nbv} /></Td>
                <Td right muted>{a.estCurrentValueCents ? <Money cents={a.estCurrentValueCents} /> : "–"}</Td>
                <Td right muted>{a.usefulLifeYears && used != null ? `${Math.max(0, a.usefulLifeYears - used).toFixed(1)} yr` : "–"}</Td>
                <Td right>{loan ? <Money cents={loan.balanceCents} /> : "–"}</Td>
                <Td right className={repairs(a, "ttm") > 1_000_000n ? "text-rust" : ""}>{repairs(a, "ttm") ? <Money cents={repairs(a, "ttm")} /> : "–"}</Td>
                <Td muted className="max-w-[200px] truncate" title={a.usage ?? undefined}>{a.usage ?? "–"}</Td>
              </tr>
            );
          })}
        </tbody>
      </Table>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        {pick && rvr && (
          <Card className="p-6" >
            <h3 id="rvr" className="font-serif text-lg font-semibold text-ink">Repair or Replace</h3>
            <p className="text-sm text-muted">{pick.description}</p>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {rvr.options.map((o) => (
                <div key={o.key} className={clsx("rounded-btn p-3", o.key === rvr!.best.key ? "bg-mint" : "bg-surface-sunken")}>
                  <p className="text-xs uppercase tracking-wider text-muted">{o.label}</p>
                  <p className="mt-1 font-serif text-xl font-bold"><Money cents={o.perYearCents} /></p>
                  <p className="text-xs text-muted">per year</p>
                </div>
              ))}
            </div>
            <form method="get" className="mt-5 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
              <input type="hidden" name="asset" value={pick.id} />
              <Input name="horizon" label="Years to Compare" value={n(searchParams.horizon, 5)} step="1" />
              <Input name="repairs" label="Repairs Now / Yr" value={n(searchParams.repairs, Number(repairs(pick, lastYear) || repairs(pick, "ttm")) / 100)} />
              <Input name="growth" label="Repair Growth %" value={n(searchParams.growth, 15)} />
              <Input name="overhaul" label="Overhaul Cost" value={n(searchParams.overhaul, 0)} />
              <Input name="afterOverhaul" label="Repairs After Overhaul" value={n(searchParams.afterOverhaul, Number(repairs(pick, lastYear)) / 200)} />
              <Input name="newPrice" label="Replacement Price" value={n(searchParams.newPrice, Number(pick.originalCostCents) / 100 * 1.25)} />
              <Input name="tradeIn" label="Trade-In" value={n(searchParams.tradeIn, Number(pick.estCurrentValueCents ?? 0n) / 100)} />
              <Input name="rate" label="Rate %" value={n(searchParams.rate, 7.5)} />
              <Input name="term" label="Term (Years)" value={n(searchParams.term, 7)} step="1" />
              <Input name="newRepairs" label="New Repairs / Yr" value={n(searchParams.newRepairs, 6000)} />
              <Input name="endResale" label="Resale at End" value={n(searchParams.endResale, 0)} />
              <button className="rounded-btn bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-deep sm:col-span-2">Compare</button>
            </form>
          </Card>
        )}
        <Card className="p-6">
          <h3 className="font-serif text-lg font-semibold text-ink">Can I Afford It?</h3>
          <p className="text-sm text-muted">Repayment margin (12 mo): <Money cents={snap.ratios.repaymentMarginCents} className="text-sm" /></p>
          <form method="get" className="mt-5 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
            {pick && <input type="hidden" name="asset" value={pick.id} />}
            <Input name="buyPrice" label="Price" value={n(searchParams.buyPrice, 0)} />
            <Input name="buyDown" label="Down Payment" value={n(searchParams.buyDown, 0)} />
            <Input name="buyTrade" label="Trade-In" value={n(searchParams.buyTrade, 0)} />
            <Input name="buyRate" label="Rate %" value={n(searchParams.buyRate, 7.5)} />
            <Input name="buyYears" label="Years" value={n(searchParams.buyYears, 5)} step="1" />
            <Input name="buySavings" label="Savings / Yr" value={n(searchParams.buySavings, 0)} />
            <Input name="buyLife" label="Useful Life" value={n(searchParams.buyLife, 10)} step="1" />
            <Input name="buySalvage" label="Resale Value" value={n(searchParams.buySalvage, 0)} />
            <button className="rounded-btn bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-deep sm:col-span-2">Check</button>
          </form>
          {buy && (
            <dl className="mt-5 divide-y divide-border text-sm">
              {([["Financed", buy.financedCents], ["Annual Payment", buy.annualPaymentCents], ["Total Interest", buy.totalInterestCents], ["Depreciation / Yr", buy.annualDepreciationCents], ["Cash at Purchase", buy.cashAtPurchaseCents], ["Margin After Payment", buy.marginAfterCents]] as const).map(([k, v]) => (
                <div key={k} className="flex justify-between py-2"><dt className="text-muted">{k}</dt><dd><Money cents={v} /></dd></div>
              ))}
              <div className={clsx("flex justify-between py-2 font-semibold", buy.affordable ? "text-positive" : "text-negative")}><dt>{buy.affordable ? "Affordable at Current Earnings" : "Not Covered by Current Earnings"}</dt><dd /></div>
            </dl>
          )}
          <p className="mt-3 text-xs text-muted"><a className="underline" href={`/scenarios?eqPrice=${n(searchParams.buyPrice, 0)}&eqDown=${n(searchParams.buyDown, 0)}&eqRate=${n(searchParams.buyRate, 7.5)}&eqYears=${n(searchParams.buyYears, 5)}&eqLife=${n(searchParams.buyLife, 10)}&eqSalvage=${n(searchParams.buySalvage, 0)}`}>Open in Scenarios</a></p>
        </Card>
      </div>
      <p className="mt-3 text-xs text-muted">{num(assets.length - active.length)} disposed asset{assets.length - active.length === 1 ? "" : "s"} not shown</p>
    </>
  );
}
