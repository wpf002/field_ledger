import clsx from "clsx";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { LinkTabs } from "@/components/ui/link-tabs";
import { Table, Th, Td, pct } from "@/components/ui/table";
import { CashProjectionChart } from "@/components/charts/cash-projection-chart";
import { prisma } from "@fl/db";
import { getDemoFarmId, getCurrentRole, canWrite } from "@/lib/data";
import { getForecastContext, backtest, SCENARIO_KEYS } from "@/lib/forecast";
import { fmtDate, fmtMonthDay } from "@/lib/format";
import { DEFAULT_SCENARIOS, mape, enterpriseStatements, sumCents, type ScenarioKey, type CashPeriod } from "@fl/core";
import { saveForecastSettings, saveForecastRun } from "./actions";
import { TriangleAlert, CircleCheck } from "lucide-react";

export const dynamic = "force-dynamic";
type View = "weeks" | "months" | "revenue" | "accuracy";
const monthLabel = (d: Date) => d.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });

function CashGrid({ periods, labels, reserve }: { periods: CashPeriod[]; labels: string[]; reserve: bigint }) {
  const groups = [...new Set(periods.flatMap((p) => [...p.byGroup.keys()]))];
  const receipts = groups.filter((g) => periods.some((p) => (p.byGroup.get(g) ?? 0n) > 0n));
  const payments = groups.filter((g) => !receipts.includes(g));
  const row = (label: string, get: (p: CashPeriod) => bigint, opts: { strong?: boolean; muted?: boolean; warn?: boolean } = {}) => (
    <tr key={label} className={clsx("border-t border-border", opts.strong && "font-semibold")}>
      <Td className="sticky left-0 z-10 min-w-[220px] bg-surface" muted={opts.muted} strong={opts.strong}>{label}</Td>
      {periods.map((p, i) => { const v = get(p); return <Td key={i} right className={clsx(opts.warn && v < reserve && "bg-[#F3E3E0]")}>{v === 0n ? <span className="text-muted">–</span> : <Money cents={v} />}</Td>; })}
    </tr>
  );
  return (
    <Table minWidth={260 + periods.length * 104}>
      <thead><tr><Th className="sticky left-0 z-10 bg-surface"> </Th>{labels.map((l) => <Th key={l} right>{l}</Th>)}</tr></thead>
      <tbody>
        {row("Starting Cash", (p) => p.beginningCashCents, { strong: true })}
        {receipts.map((g) => row(g, (p) => p.byGroup.get(g) ?? 0n, { muted: true }))}
        {payments.map((g) => row(g, (p) => p.byGroup.get(g) ?? 0n, { muted: true }))}
        {row("Line Interest", (p) => -p.lineInterestCents, { muted: true })}
        {row("Line Draws", (p) => p.drawsCents, { muted: true })}
        {row("Line Repayments", (p) => -p.repaymentsCents, { muted: true })}
        {row("Ending Cash", (p) => p.endingCashCents, { strong: true, warn: true })}
        {row("Line Balance", (p) => p.lineBalanceCents, { muted: true })}
      </tbody>
    </Table>
  );
}

export default async function ForecastPage({ searchParams }: { searchParams: { view?: string; scenario?: string } }) {
  const farmId = await getDemoFarmId();
  const editable = canWrite(await getCurrentRole());
  const ctx = await getForecastContext(farmId);
  const view: View = (["months", "revenue", "accuracy"] as const).find((v) => v === searchParams.view) ?? "weeks";
  const scenario: ScenarioKey = SCENARIO_KEYS.find((k) => k === searchParams.scenario) ?? "base";
  const href = (patch: { view?: string; scenario?: string }) => `/forecast?view=${patch.view ?? view}&scenario=${patch.scenario ?? scenario}`;
  const reserve = ctx.reserveCents;

  let body: React.ReactNode;
  if (view === "weeks") {
    const f = ctx.thirteen(scenario);
    body = (
      <>
        <div className={clsx("mb-5 flex items-start gap-3 rounded-card p-4 text-sm", f.reserveBreach ? "bg-[#F3E3E0] text-ink" : "bg-mint text-ink")}>
          {f.reserveBreach ? <TriangleAlert size={18} className="mt-0.5 shrink-0 text-negative" /> : <CircleCheck size={18} className="mt-0.5 shrink-0 text-positive" />}
          {f.reserveBreach
            ? <span>Cash falls below your <Money cents={reserve} className="text-sm" /> reserve the week of {fmtMonthDay(f.reserveBreach.start)} before line support. Low point <Money cents={f.minimum.cents} className="text-sm" /> in week {f.minimum.week}.</span>
            : <span>Cash stays above your <Money cents={reserve} className="text-sm" /> reserve for 13 weeks. Low point <Money cents={f.minimum.cents} className="text-sm" /> in week {f.minimum.week}.</span>}
        </div>
        <CashGrid periods={f.weeks} labels={f.weeks.map((w) => fmtMonthDay(new Date(w.start.getTime() + 86_400_000)))} reserve={reserve} />
        <Card className="mt-6 p-6">
          <h3 className="font-serif text-lg font-semibold text-ink">Known Items</h3>
          <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
            <thead><tr><Th>Date</Th><Th>Source</Th><Th>Item</Th><Th right>Amount</Th></tr></thead>
            <tbody>
              {f.items.filter((i) => i.source !== "operating plan").sort((a, b) => a.date.getTime() - b.date.getTime()).map((i, n) => (
                <tr key={n} className="border-t border-border"><Td muted>{fmtDate(i.date)}</Td><Td muted>{i.source === "open item" ? "Open Invoice/Bill" : "Loan Schedule"}</Td><Td className="max-w-[420px] truncate" title={i.description}>{i.description}</Td><Td right><Money cents={i.cents} /></Td></tr>
              ))}
            </tbody>
          </table></div>
        </Card>
      </>
    );
  } else if (view === "months") {
    const runs = Object.fromEntries(SCENARIO_KEYS.map((k) => [k, ctx.twelve(k)])) as Record<ScenarioKey, ReturnType<typeof ctx.twelve>>;
    const f = runs[scenario];
    const summary = SCENARIO_KEYS.map((k) => {
      const m = runs[k];
      return {
        k, label: DEFAULT_SCENARIOS[k].label,
        profit: sumCents(m.map((x) => x.pnl.netIncomeOperatingCents)),
        revenue: sumCents(m.map((x) => x.pnl.revenueCents)),
        minCash: m.reduce((a, x) => (x.cash.endingCashCents < a ? x.cash.endingCashCents : a), m[0]!.cash.endingCashCents),
        peakLine: m.reduce((a, x) => (x.cash.lineBalanceCents > a ? x.cash.lineBalanceCents : a), 0n),
        endCash: m[m.length - 1]!.cash.endingCashCents,
      };
    });
    const pnlRow = (label: string, get: (x: (typeof f)[number]) => bigint, strong = false) => (
      <tr key={label} className={clsx("border-t border-border", strong && "font-semibold")}>
        <Td className="sticky left-0 z-10 min-w-[200px] bg-surface" strong={strong} muted={!strong}>{label}</Td>
        {f.map((x, i) => <Td key={i} right><Money cents={get(x)} /></Td>)}
        <Td right strong><Money cents={sumCents(f.map(get))} /></Td>
      </tr>
    );
    body = (
      <>
        <div className="mb-5 grid gap-4 md:grid-cols-3">
          {summary.map((s) => (
            <a key={s.k} href={href({ scenario: s.k })} className={clsx("rounded-card p-5 shadow-card transition", s.k === scenario ? "bg-primary text-white" : "bg-surface hover:bg-tag/30")}>
              <p className={clsx("text-xs uppercase tracking-wider", s.k === scenario ? "text-white/80" : "text-muted")}>{s.label}</p>
              <p className="mt-2 font-serif text-2xl font-bold"><Money cents={s.profit} className={s.k === scenario ? "text-white" : ""} /></p>
              <p className={clsx("text-xs", s.k === scenario ? "text-white/75" : "text-muted")}>Net income · min cash <Money cents={s.minCash} className="text-xs" /> · peak line <Money cents={s.peakLine} className="text-xs" /></p>
            </a>
          ))}
        </div>
        {editable && (
          <form action={saveForecastRun} className="mb-3 flex justify-end">
            <input type="hidden" name="scenario" value={scenario} />
            <button className="rounded-btn border border-border px-3 py-1.5 text-sm text-ink hover:bg-tag/40">Save Forecast</button>
          </form>
        )}
        <Card className="mb-6 p-6">
          <CashProjectionChart reserve={Number(reserve) / 100} data={f.map((m) => ({ label: monthLabel(m.monthEnd), cash: Number(m.cash.endingCashCents) / 100, line: Number(m.cash.lineBalanceCents) / 100 }))} />
        </Card>
        <Table minWidth={260 + 13 * 104} className="mb-6">
          <thead><tr><Th className="sticky left-0 z-10 bg-surface"> </Th>{f.map((m) => <Th key={m.monthEnd.toISOString()} right>{monthLabel(m.monthEnd)}</Th>)}<Th right>Total</Th></tr></thead>
          <tbody>
            {pnlRow("Revenue", (x) => x.pnl.revenueCents)}
            {pnlRow("Cost of Production", (x) => -x.pnl.copCents)}
            {pnlRow("Overhead", (x) => -x.pnl.overheadCents)}
            {pnlRow("Depreciation", (x) => -x.pnl.depreciationCents)}
            {pnlRow("Interest", (x) => -x.pnl.interestCents)}
            {pnlRow("Net Income", (x) => x.pnl.netIncomeOperatingCents, true)}
          </tbody>
        </Table>
        <CashGrid periods={f.map((m) => m.cash)} labels={f.map((m) => monthLabel(m.monthEnd))} reserve={reserve} />
      </>
    );
  } else if (view === "revenue") {
    const f = ctx.twelve(scenario);
    const enterprises = await prisma.enterprise.findMany({ where: { farmId } });
    const from = ctx.asOf, to = f[f.length - 1]!.monthEnd;
    const lastFrom = new Date(Date.UTC(from.getUTCFullYear() - 1, from.getUTCMonth() + 1, 0));
    const actual = enterpriseStatements(ctx.inputs.rows, lastFrom, from);
    const d = ctx.drivers[scenario];
    const factor = (1 + d.pricePct) * (1 + d.volumePct);
    const rows = enterprises.map((e) => ({ e, last: actual.get(e.id)?.revenueCents ?? 0n })).filter((r) => r.last !== 0n).sort((a, b) => Number(b.last - a.last));
    const seasons = await prisma.cropSeason.findMany({ where: { farmId, year: { gte: from.getUTCFullYear() } }, orderBy: [{ year: "asc" }, { crop: "asc" }] });
    body = (
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Table minWidth={560}>
          <thead><tr><Th>Enterprise</Th><Th right>Last 12 Months</Th><Th right>Next 12 Months</Th><Th right>Change</Th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const next = BigInt(Math.round(Number(r.last) * factor));
              return <tr key={r.e.id} className="border-t border-border"><Td className="min-w-[240px]">{r.e.name}</Td><Td right><Money cents={r.last} /></Td><Td right strong><Money cents={next} /></Td><Td right muted>{pct(factor - 1)}</Td></tr>;
            })}
            <tr className="border-t-2 border-border font-semibold"><Td strong>Total</Td><Td right><Money cents={sumCents(rows.map((r) => r.last))} /></Td><Td right><Money cents={sumCents(f.map((m) => m.pnl.revenueCents))} /></Td><Td /></tr>
          </tbody>
        </Table>
        {seasons.length > 0 && (
          <Card className="h-fit p-6">
            <h3 className="font-serif text-lg font-semibold text-ink">Crop Plan</h3>
            <dl className="mt-3 divide-y divide-border text-sm">
              {seasons.map((s) => {
                const exp = Number(s.acres) * Number(s.expectedYield ?? 0) * Number(s.expectedPrice ?? 0);
                return (
                  <div key={s.id} className="py-2">
                    <dt className="flex justify-between"><span className="font-medium text-ink">{s.crop} {s.year}</span><span>{exp ? `$${Math.round(exp).toLocaleString()}` : "–"}</span></dt>
                    <dd className="text-xs text-muted">{Number(s.acres).toLocaleString()} ac × {Number(s.expectedYield ?? 0).toLocaleString()} {(s.yieldUnit ?? "").replace("/ac", "")} × ${Number(s.expectedPrice ?? 0)}</dd>
                  </div>
                );
              })}
            </dl>
          </Card>
        )}
      </div>
    );
  } else {
    const bt = backtest(ctx);
    const err = (k: "revenueCents" | "copCents" | "netIncomeOperatingCents") => mape(bt.months.map((m) => ({ forecast: m.forecast[k], actual: m.actual[k] })));
    const annual = (k: "revenueCents" | "copCents" | "netIncomeOperatingCents") => ({ f: sumCents(bt.months.map((m) => m.forecast[k])), a: sumCents(bt.months.map((m) => m.actual[k])) });
    const runs = await prisma.forecastRun.count({ where: { farmId } });
    body = (
      <>
        <div className="mb-5 grid gap-4 md:grid-cols-3">
          {([["Revenue", "revenueCents"], ["Cost of Production", "copCents"], ["Net Income", "netIncomeOperatingCents"]] as const).map(([label, k]) => {
            const a = annual(k);
            return (
              <Card key={k} className="p-5">
                <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
                <p className="mt-2 text-sm text-muted">Forecast <Money cents={a.f} className="text-sm text-ink" /> · Actual <Money cents={a.a} className="text-sm text-ink" /></p>
                <p className="mt-1 text-sm">Annual miss <span className="font-semibold">{a.a ? pct(Number(a.f - a.a) / Math.abs(Number(a.a))) : "–"}</span> · Monthly error {pct(err(k))}</p>
              </Card>
            );
          })}
        </div>
        <Table minWidth={900}>
          <thead><tr><Th>Month</Th><Th right>Revenue F</Th><Th right>Revenue A</Th><Th right>Costs F</Th><Th right>Costs A</Th><Th right>Net F</Th><Th right>Net A</Th><Th right>Net Cash F</Th><Th right>Net Cash A</Th></tr></thead>
          <tbody>
            {bt.months.map((m) => (
              <tr key={m.monthEnd.toISOString()} className="border-t border-border">
                <Td>{monthLabel(m.monthEnd)}</Td>
                <Td right muted><Money cents={m.forecast.revenueCents} /></Td><Td right><Money cents={m.actual.revenueCents} /></Td>
                <Td right muted><Money cents={m.forecast.copCents} /></Td><Td right><Money cents={m.actual.copCents} /></Td>
                <Td right muted><Money cents={m.forecast.netIncomeOperatingCents} /></Td><Td right><Money cents={m.actual.netIncomeOperatingCents} /></Td>
                <Td right muted><Money cents={m.forecastNetCash} /></Td><Td right><Money cents={m.actualNetCash} /></Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="mt-3 text-xs text-muted">Base case rerun as of {fmtDate(bt.asOf)} with what was known then · {runs} saved forecast{runs === 1 ? "" : "s"}</p>
      </>
    );
  }

  const d = ctx.drivers;
  return (
    <>
      <PageHeader title="Forecast" subtitle={`From ${fmtDate(ctx.asOf)}`} />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <LinkTabs value={view} options={[
          { value: "weeks", label: "13 Weeks", href: href({ view: "weeks" }) }, { value: "months", label: "12 Months", href: href({ view: "months" }) },
          { value: "revenue", label: "Revenue", href: href({ view: "revenue" }) }, { value: "accuracy", label: "Accuracy", href: href({ view: "accuracy" }) },
        ]} />
        {view !== "accuracy" && <LinkTabs value={scenario} options={SCENARIO_KEYS.map((k) => ({ value: k, label: DEFAULT_SCENARIOS[k].label, href: href({ scenario: k }) }))} />}
      </div>
      {body}
      <details className="mt-8 rounded-card bg-surface p-5 shadow-card">
        <summary className="cursor-pointer font-serif text-lg font-semibold text-ink">Assumptions</summary>
        <form action={saveForecastSettings} className="mt-4 space-y-4 text-sm">
          <label className="flex items-center gap-3"><span className="w-40 text-muted">Cash Reserve</span><input name="reserve" type="number" step="1000" min="0" defaultValue={Number(ctx.reserveCents) / 100} disabled={!editable} className="input w-40" /></label>
          <div className="overflow-x-auto"><table className="min-w-[520px] text-sm">
            <thead><tr><Th>Scenario</Th><Th right>Price %</Th><Th right>Volume %</Th><Th right>Cost %</Th></tr></thead>
            <tbody>
              {SCENARIO_KEYS.map((k) => (
                <tr key={k} className="border-t border-border">
                  <Td>{DEFAULT_SCENARIOS[k].label}</Td>
                  {(["price", "volume", "cost"] as const).map((f) => {
                    const v = f === "price" ? d[k].pricePct : f === "volume" ? d[k].volumePct : d[k].costInflationPct;
                    return <Td key={f} right><input name={`${k}.${f}`} type="number" step="0.5" defaultValue={(v * 100).toFixed(1)} disabled={!editable} className="input w-24 text-right" /></Td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table></div>
          {editable && <button className="rounded-btn bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-deep">Save</button>}
        </form>
      </details>
    </>
  );
}
