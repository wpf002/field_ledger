import clsx from "clsx";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { LinkTabs } from "@/components/ui/link-tabs";
import { Table, Th, Td } from "@/components/ui/table";
import { prisma, evaluateLever, leverContext, type LeverTemplate } from "@fl/db";
import { getDemoFarmId, getCurrentRole, canWrite } from "@/lib/data";
import { getForecastContext } from "@/lib/forecast";
import { runWhatIf, type WhatIf, type Outcome } from "@fl/db";
import { addLever, removeLever } from "./actions";
import { Trash2 } from "lucide-react";

export const dynamic = "force-dynamic";
type SP = Record<string, string | undefined>;
const n = (v: string | undefined, d = 0) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : d);
const fmtR = (v: number | null) => (v == null || !Number.isFinite(v) ? "–" : v.toFixed(2));
const fmtP = (v: number | null) => (v == null || !Number.isFinite(v) ? "–" : `${(v * 100).toFixed(1)}%`);

function Field({ name, label, value, step = "any", suffix }: { name: string; label: string; value: number | string; step?: string; suffix?: string }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted">{label}</span>
      <span className="flex items-center gap-1"><input name={name} type="number" step={step} defaultValue={value} className="input w-28 text-right" />{suffix && <span className="w-4 text-xs text-muted">{suffix}</span>}</span>
    </label>
  );
}

export default async function ScenariosPage({ searchParams }: { searchParams: SP }) {
  const farmId = await getDemoFarmId();
  const editable = canWrite(await getCurrentRole());
  const view = searchParams.view === "questions" ? "questions" : "whatif";

  let body: React.ReactNode;
  if (view === "whatif") {
    const ctx = await getForecastContext(farmId);
    const w: WhatIf = {
      pricePct: n(searchParams.price) / 100, volumePct: n(searchParams.volume) / 100, costPct: n(searchParams.cost) / 100,
      equipment: n(searchParams.eqPrice) > 0 ? { price: n(searchParams.eqPrice), down: n(searchParams.eqDown), ratePct: n(searchParams.eqRate, 7.5), years: n(searchParams.eqYears, 5), life: n(searchParams.eqLife, 10), salvage: n(searchParams.eqSalvage) } : undefined,
      hireAnnualWage: n(searchParams.hire),
      lease: n(searchParams.leaseAcres) > 0 ? { acres: n(searchParams.leaseAcres), rentPerAcre: n(searchParams.leaseRent), marginPerAcre: n(searchParams.leaseMargin) } : undefined,
    };
    const before = runWhatIf(ctx, { pricePct: 0, volumePct: 0, costPct: 0 });
    const after = runWhatIf(ctx, w);
    const rows: { label: string; k: keyof Outcome; kind: "money" | "ratio" | "pct" | "score"; better: "up" | "down" }[] = [
      { label: "Net Income (12 Mo)", k: "profitCents", kind: "money", better: "up" },
      { label: "Cash at 12 Months", k: "endingCashCents", kind: "money", better: "up" },
      { label: "Lowest Month-End Cash", k: "minCashCents", kind: "money", better: "up" },
      { label: "Peak Operating Line", k: "peakLineCents", kind: "money", better: "down" },
      { label: "Debt at 12 Months", k: "debtCents", kind: "money", better: "down" },
      { label: "Working Capital", k: "workingCapitalCents", kind: "money", better: "up" },
      { label: "Current Ratio", k: "currentRatio", kind: "ratio", better: "up" },
      { label: "Debt to Assets", k: "debtToAsset", kind: "pct", better: "down" },
      { label: "Term Debt Coverage", k: "coverage", kind: "ratio", better: "up" },
      { label: "Health Score", k: "health", kind: "score", better: "up" },
    ];
    const show = (o: Outcome, r: (typeof rows)[number]) => {
      const v = o[r.k];
      return r.kind === "money" ? <Money cents={v as bigint} /> : r.kind === "ratio" ? fmtR(v as number | null) : r.kind === "pct" ? fmtP(v as number | null) : String(v);
    };
    const delta = (r: (typeof rows)[number]) => {
      const a = before[r.k], b = after[r.k];
      if (typeof a === "bigint" && typeof b === "bigint") { const d = b - a; return { d: <Money cents={d} />, good: r.better === "up" ? d >= 0n : d <= 0n, zero: d === 0n }; }
      if (typeof a === "number" && typeof b === "number") { const d = b - a; return { d: r.kind === "pct" ? fmtP(d) : r.kind === "score" ? `${d > 0 ? "+" : ""}${d}` : `${d > 0 ? "+" : ""}${d.toFixed(2)}`, good: r.better === "up" ? d >= 0 : d <= 0, zero: Math.abs(d) < 1e-9 }; }
      return { d: "–", good: true, zero: true };
    };
    body = (
      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <form className="h-fit space-y-5 rounded-card bg-surface p-5 shadow-card" method="get">
          <input type="hidden" name="view" value="whatif" />
          <div className="space-y-2"><h3 className="font-serif text-base font-semibold text-ink">Prices & Costs</h3>
            <Field name="price" label="Price Change" value={n(searchParams.price)} suffix="%" />
            <Field name="volume" label="Volume Change" value={n(searchParams.volume)} suffix="%" />
            <Field name="cost" label="Cost Change" value={n(searchParams.cost)} suffix="%" />
          </div>
          <div className="space-y-2 border-t border-border pt-4"><h3 className="font-serif text-base font-semibold text-ink">Buy Equipment</h3>
            <Field name="eqPrice" label="Price" value={n(searchParams.eqPrice)} suffix="$" step="1000" />
            <Field name="eqDown" label="Down Payment" value={n(searchParams.eqDown)} suffix="$" step="1000" />
            <Field name="eqRate" label="Rate" value={n(searchParams.eqRate, 7.5)} suffix="%" />
            <Field name="eqYears" label="Years" value={n(searchParams.eqYears, 5)} step="1" />
            <Field name="eqLife" label="Useful Life" value={n(searchParams.eqLife, 10)} step="1" />
            <Field name="eqSalvage" label="Salvage" value={n(searchParams.eqSalvage)} suffix="$" step="1000" />
          </div>
          <div className="space-y-2 border-t border-border pt-4"><h3 className="font-serif text-base font-semibold text-ink">Hire & Lease</h3>
            <Field name="hire" label="New Hire Wages" value={n(searchParams.hire)} suffix="$" step="1000" />
            <Field name="leaseAcres" label="Lease Acres" value={n(searchParams.leaseAcres)} step="10" />
            <Field name="leaseRent" label="Rent per Acre" value={n(searchParams.leaseRent)} suffix="$" />
            <Field name="leaseMargin" label="Margin per Acre" value={n(searchParams.leaseMargin)} suffix="$" />
          </div>
          <div className="flex gap-2"><button className="rounded-btn bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-deep">Run</button><a href="/scenarios" className="rounded-btn border border-border px-4 py-2 text-sm text-ink hover:bg-tag/40">Reset</a></div>
        </form>
        <Table minWidth={560}>
          <thead><tr><Th>Measure</Th><Th right>Base Forecast</Th><Th right>With Changes</Th><Th right>Change</Th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const d = delta(r);
              return (
                <tr key={r.k} className="border-t border-border">
                  <Td>{r.label}</Td><Td right muted>{show(before, r)}</Td><Td right strong>{show(after, r)}</Td>
                  <Td right className={clsx(d.zero ? "text-muted" : d.good ? "text-positive" : "text-negative")}>{d.d}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </div>
    );
  } else {
    const [levers, lc, revLines, costLines] = await Promise.all([
      prisma.scenarioLever.findMany({ where: { farmId }, orderBy: [{ externalId: "asc" }, { id: "asc" }] }),
      leverContext(prisma, farmId),
      prisma.account.findMany({ where: { farmId, section: "REV" }, distinct: ["statementLine"], select: { statementLine: true } }),
      prisma.account.findMany({ where: { farmId, section: { in: ["COP", "OVH"] } }, distinct: ["statementLine"], select: { statementLine: true } }),
    ]);
    const year = lc.asOf.getUTCFullYear() - 1;
    body = (
      <>
        <Table minWidth={900}>
          <thead><tr><Th>Question</Th><Th>Change</Th><Th right>Annual Impact</Th><Th>How</Th>{editable && <Th />}</tr></thead>
          <tbody>
            {levers.map((l) => {
              const r = evaluateLever(lc, (l.template ?? "manual") as LeverTemplate, (l.params ?? {}) as Record<string, unknown>);
              return (
                <tr key={l.id} className="border-t border-border align-top">
                  <Td className="max-w-[320px]"><span className="font-medium">{l.question}</span><p className="text-xs text-muted">{l.driver}</p></Td>
                  <Td muted className="max-w-[220px]">{l.scenarioChange ?? "–"}</Td>
                  <Td right strong className={r && r.impactCents < 0n ? "text-negative" : "text-positive"}>{r ? <><Money cents={r.impactCents} /><p className="text-xs font-normal text-muted">{r.unit}</p></> : "–"}</Td>
                  <Td muted className="max-w-[360px] text-xs">{r?.basis ?? "Not enough data"}{l.template === "manual" && <span className="ml-1 rounded-pill bg-[#F6EAC6] px-1.5 text-[10px] text-ink">Estimate</span>}</Td>
                  {editable && <Td><form action={removeLever}><input type="hidden" name="id" value={l.id} /><button title="Remove" className="text-muted hover:text-negative"><Trash2 size={15} /></button></form></Td>}
                </tr>
              );
            })}
          </tbody>
        </Table>
        {editable && (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <h3 className="font-serif text-base font-semibold text-ink">Price or Cost Move</h3>
              <form action={addLever} className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <select name="template" className="input"><option value="price_shock">Revenue Price</option><option value="cost_shock">Input Cost</option></select>
                <select name="line" className="input">{[...revLines, ...costLines].map((x) => x.statementLine).filter(Boolean).map((x) => <option key={x!}>{x}</option>)}</select>
                <input name="pct" type="number" step="any" placeholder="% Change" className="input" required />
                <input name="year" type="number" defaultValue={year} className="input" />
                <button className="col-span-2 rounded-btn bg-primary px-4 py-2 font-medium text-white hover:bg-primary-deep">Add</button>
              </form>
            </Card>
            <Card className="p-5">
              <h3 className="font-serif text-base font-semibold text-ink">Equipment Purchase</h3>
              <form action={addLever} className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <input type="hidden" name="template" value="equipment_purchase" />
                <input name="price" type="number" placeholder="Price" className="input" required />
                <input name="down" type="number" placeholder="Down Payment" className="input" />
                <input name="ratePct" type="number" step="any" placeholder="Rate %" className="input" required />
                <input name="years" type="number" placeholder="Years" className="input" required />
                <input name="year" type="hidden" value={year} />
                <button className="col-span-2 rounded-btn bg-primary px-4 py-2 font-medium text-white hover:bg-primary-deep">Add</button>
              </form>
            </Card>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <PageHeader title="Scenarios" />
      <div className="mb-5"><LinkTabs value={view} options={[{ value: "whatif", label: "What-If", href: "/scenarios" }, { value: "questions", label: "Questions", href: "/scenarios?view=questions" }]} /></div>
      {body}
    </>
  );
}
