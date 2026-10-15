import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkTabs } from "@/components/ui/link-tabs";
import { Table, Th, Td, num, pct } from "@/components/ui/table";
import { prisma } from "@fl/db";
import { getDemoFarmId } from "@/lib/data";
import { getStatementContext } from "@/lib/statements";
import { fmtDate } from "@/lib/format";
import { Beef } from "lucide-react";

export const dynamic = "force-dynamic";
type View = "herd" | "flow" | "repro" | "registry";

export default async function HerdPage({ searchParams }: { searchParams: { view?: string; year?: string; species?: string } }) {
  const farmId = await getDemoFarmId();
  const { asOf } = await getStatementContext(farmId);
  const [animals, flow, repro, bulls, semen] = await Promise.all([
    prisma.animal.findMany({ where: { farmId }, orderBy: [{ species: "asc" }, { birthDate: "desc" }] }),
    prisma.herdFlowMonth.findMany({ where: { farmId }, orderBy: [{ monthEnd: "asc" }] }),
    prisma.reproductionYear.findMany({ where: { farmId }, orderBy: { year: "asc" } }),
    prisma.bullValuation.findMany({ where: { farmId }, orderBy: { asOf: "desc" } }),
    prisma.semenEvent.findMany({ where: { farmId } }),
  ]);
  if (animals.length === 0 && flow.length === 0) {
    return (<><PageHeader title="Herd" /><EmptyState icon={<Beef size={22} />} title="No Animals Recorded" /></>);
  }
  const view: View = (["flow", "repro", "registry"] as const).find((v) => v === searchParams.view) ?? "herd";
  const years = [...new Set(flow.map((f) => f.monthEnd.getUTCFullYear()))].sort((a, b) => b - a);
  const year = years.includes(Number(searchParams.year)) ? Number(searchParams.year) : years[0] ?? asOf.getUTCFullYear();
  const href = (v: string, extra = "") => `/herd?view=${v}&year=${year}${extra}`;

  // Current head by class from the latest month-end roll.
  const lastMonth = flow.length ? flow[flow.length - 1]!.monthEnd.getTime() : 0;
  const current = flow.filter((f) => f.monthEnd.getTime() === lastMonth && f.ending > 0);
  const live = animals.filter((a) => !a.dispositionDate || a.dispositionDate > asOf);

  let body: React.ReactNode;
  if (view === "herd") {
    const latestBull = new Map<string, (typeof bulls)[number]>();
    for (const b of bulls) if (!latestBull.has(b.animalId) && b.asOf <= asOf) latestBull.set(b.animalId, b);
    const strawsBy = new Map<string, number>();
    for (const e of semen) if (/sale/i.test(e.event) && e.date.getUTCFullYear() === asOf.getUTCFullYear()) strawsBy.set(e.bullId, (strawsBy.get(e.bullId) ?? 0) + e.straws);
    body = (
      <div className="grid gap-6 lg:grid-cols-2">
        <Table minWidth={420}>
          <thead><tr><Th>Class</Th><Th>Species</Th><Th right>Head</Th></tr></thead>
          <tbody>
            {current.map((c) => <tr key={c.id} className="border-t border-border"><Td>{c.animalClass}</Td><Td muted>{c.species}</Td><Td right strong>{num(c.ending)}</Td></tr>)}
            <tr className="border-t-2 border-border"><Td strong>Total</Td><Td /><Td right strong>{num(current.reduce((a, c) => a + c.ending, 0))}</Td></tr>
          </tbody>
        </Table>
        {latestBull.size > 0 && (
          <Card className="p-6">
            <h3 className="font-serif text-lg font-semibold text-ink">Sires</h3>
            <dl className="mt-3 divide-y divide-border text-sm">
              {[...latestBull.values()].map((b) => (
                <div key={b.id} className="py-2.5">
                  <dt className="flex justify-between"><span className="font-medium text-ink">{b.name ?? b.animalId}</span><Money cents={b.marketValueCents} /></dt>
                  <dd className="mt-0.5 flex justify-between text-muted"><span>Age {b.ageYears ? Number(b.ageYears).toFixed(1) : "–"} · insured {b.insuredValueCents ? <Money cents={b.insuredValueCents} className="text-sm" /> : "–"}</span><span>{num(strawsBy.get(b.animalId) ?? 0)} straws sold YTD</span></dd>
                </div>
              ))}
            </dl>
          </Card>
        )}
      </div>
    );
  } else if (view === "flow") {
    const rows = flow.filter((f) => f.monthEnd.getUTCFullYear() === year);
    const classes = [...new Set(rows.map((r) => `${r.species}|${r.animalClass}`))];
    body = (
      <>
        <div className="mb-4"><LinkTabs value={String(year)} options={years.map((y) => ({ value: String(y), label: String(y), href: `/herd?view=flow&year=${y}` }))} /></div>
        <Table minWidth={1000}>
          <thead><tr><Th>Class</Th><Th right>Opening</Th><Th right>Births</Th><Th right>Bought</Th><Th right>In</Th><Th right>Out</Th><Th right>Deaths</Th><Th right>Culled</Th><Th right>Sold</Th><Th right>Processed</Th><Th right>Home Use</Th><Th right>Ending</Th></tr></thead>
          <tbody>
            {classes.map((k) => {
              const ms = rows.filter((r) => `${r.species}|${r.animalClass}` === k);
              const s = (f: "births" | "purchases" | "transfersIn" | "transfersOut" | "deaths" | "cullsSold" | "sales" | "processed" | "householdUse") => ms.reduce((a, m) => a + m[f], 0);
              return (
                <tr key={k} className="border-t border-border">
                  <Td>{k.split("|")[1]}<p className="text-xs text-muted">{k.split("|")[0]}</p></Td>
                  <Td right>{num(ms[0]!.opening)}</Td><Td right muted>{num(s("births"))}</Td><Td right muted>{num(s("purchases"))}</Td><Td right muted>{num(s("transfersIn"))}</Td>
                  <Td right muted>{num(s("transfersOut"))}</Td><Td right muted>{num(s("deaths"))}</Td><Td right muted>{num(s("cullsSold"))}</Td><Td right muted>{num(s("sales"))}</Td>
                  <Td right muted>{num(s("processed"))}</Td><Td right muted>{num(s("householdUse"))}</Td><Td right strong>{num(ms[ms.length - 1]!.ending)}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </>
    );
  } else if (view === "repro") {
    const R = repro.map((r) => ({ year: r.year, d: r.data as Record<string, number | null> }));
    const line = (label: string, k: string, f: "pct" | "num" = "pct") => (
      <tr key={k} className="border-t border-border"><Td>{label}</Td>{R.map((r) => <Td key={r.year} right>{f === "pct" ? pct(r.d[k]) : num(r.d[k])}</Td>)}</tr>
    );
    body = R.length === 0 ? <EmptyState icon={<Beef size={22} />} title="No Reproduction Records" /> : (
      <Table minWidth={560}>
        <thead><tr><Th>Calving Year</Th>{R.map((r) => <Th key={r.year} right>{r.year}</Th>)}</tr></thead>
        <tbody>
          {line("Females Calving", "females_calving", "num")}{line("Calves Born", "calves_born", "num")}{line("Calving Rate", "calving_rate")}
          {line("Calf Survival", "calf_survival")}{line("Calves Weaned", "calves_weaned", "num")}{line("Weaning Rate", "weaning_rate")}
          {line("Conception Rate", "conception_rate")}{line("Avg Weaning Wt, Steers", "avg_weaning_wt_steer", "num")}{line("Avg Weaning Wt, Heifers", "avg_weaning_wt_heifer", "num")}
          {line("Bull Prospects Kept", "bull_prospects_retained", "num")}{line("Heifer Candidates Kept", "heifer_candidates_retained", "num")}
        </tbody>
      </Table>
    );
  } else {
    const species = [...new Set(animals.map((a) => a.species))];
    const sp = species.includes(searchParams.species ?? "") ? searchParams.species! : species[0]!;
    const list = animals.filter((a) => a.species === sp).slice(0, 300);
    body = (
      <>
        <div className="mb-4"><LinkTabs value={sp} options={species.map((s) => ({ value: s, label: s, href: `/herd?view=registry&species=${encodeURIComponent(s)}` }))} /></div>
        <Table minWidth={1000}>
          <thead><tr><Th>Tag</Th><Th>Sex</Th><Th>Born</Th><Th>Origin</Th><Th>Dam</Th><Th>Sire</Th><Th>Class</Th><Th>Status</Th><Th right>Sale Wt</Th><Th right>Price</Th></tr></thead>
          <tbody>
            {list.map((a) => (
              <tr key={a.id} className="border-t border-border">
                <Td><span className="font-medium">{a.nameOrTag ?? a.externalId}</span>{a.aiSired && <span className="ml-2 text-[11px] text-muted">AI</span>}</Td>
                <Td muted>{a.sex ?? "–"}</Td><Td muted>{a.birthDate ? fmtDate(a.birthDate) : "–"}</Td><Td muted>{a.origin ?? "–"}</Td>
                <Td muted>{a.damId?.replace(/^ANM-[A-Z]+-/, "") ?? "–"}</Td><Td muted>{a.sireId?.replace(/^ANM-[A-Z]+-/, "") ?? "–"}</Td>
                <Td muted>{a.currentClass ?? "–"}</Td><Td muted>{a.dispositionType ?? a.status ?? "–"}</Td>
                <Td right muted>{a.saleWeightLb ? num(Number(a.saleWeightLb)) : "–"}</Td><Td right>{a.salePriceCents ? <Money cents={a.salePriceCents} /> : "–"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {animals.filter((a) => a.species === sp).length > 300 && <p className="mt-2 text-xs text-muted">Showing 300 of {animals.filter((a) => a.species === sp).length}</p>}
      </>
    );
  }

  return (
    <>
      <PageHeader title="Herd" subtitle={`${num(live.length)} animals on hand · ${fmtDate(asOf)}`} />
      <div className="mb-5">
        <LinkTabs value={view} options={[
          { value: "herd", label: "On Hand", href: href("herd") },
          { value: "flow", label: "Herd Flow", href: href("flow") },
          ...(repro.length ? [{ value: "repro", label: "Reproduction", href: href("repro") }] : []),
          { value: "registry", label: "Registry", href: href("registry") },
        ]} />
      </div>
      {body}
    </>
  );
}
