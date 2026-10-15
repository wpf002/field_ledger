import clsx from "clsx";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { LinkTabs } from "@/components/ui/link-tabs";
import { MonthSelect } from "@/components/month-select";
import { prisma } from "@fl/db";
import { getDemoFarmId } from "@/lib/data";
import { getStatementContext, pickMonth, monthKey } from "@/lib/statements";
import { fmtMonthYear } from "@/lib/format";
import {
  incomeStatement, balanceSheetAt, cashFlowReport, lineDetail, periodFor, priorPeriod, priorYearPeriod,
  type IncomeStatement, type BalanceSheet, type PeriodKind, type Period, type StatementRow,
} from "@fl/core";

export const dynamic = "force-dynamic";

type View = "income" | "balance" | "cash";
type Compare = "prior" | "year" | "budget";
type Params = { view?: string; period?: string; at?: string; compare?: string };

const PERIODS: { value: PeriodKind; label: string }[] = [
  { value: "month", label: "Month" }, { value: "quarter", label: "Quarter" }, { value: "year", label: "Year" },
  { value: "ytd", label: "YTD" }, { value: "ttm", label: "TTM" },
];

function href(p: Params, patch: Params) {
  const q = new URLSearchParams(Object.entries({ ...p, ...patch }).filter(([, v]) => v) as [string, string][]);
  return `/statements?${q.toString()}`;
}

// ---------- table primitives ----------
type Line = { label: string; a: bigint | null; b?: bigint | null; kind?: "total" | "grand" | "detail" | "header" | "pct"; pctA?: number | null; pctB?: number | null; invert?: boolean };

function Delta({ a, b, invert }: { a: bigint; b: bigint; invert?: boolean }) {
  const d = a - b;
  const good = invert ? d < 0n : d > 0n;
  const pct = b !== 0n ? (Number(d) / Math.abs(Number(b))) * 100 : null;
  return (
    <>
      <td className={clsx("py-2 text-right tabular-nums", d === 0n ? "text-muted" : good ? "text-positive" : "text-negative")}><Money cents={d} className="text-inherit" /></td>
      <td className="hidden py-2 text-right text-xs text-muted tabular-nums sm:table-cell">{pct == null ? "–" : `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`}</td>
    </>
  );
}

function StatementTable({ head, lines }: { head: [string, string?]; lines: Line[] }) {
  const compare = head[1] != null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-muted">
            <th className="py-2 font-medium">Line</th>
            <th className="py-2 text-right font-medium">{head[0]}</th>
            {compare && <><th className="py-2 text-right font-medium">{head[1]}</th><th className="py-2 text-right font-medium">Change</th><th className="hidden py-2 text-right font-medium sm:table-cell">%</th></>}
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            if (l.kind === "header") return <tr key={i}><td colSpan={5} className="pb-1 pt-5 text-xs font-medium uppercase tracking-wider text-muted">{l.label}</td></tr>;
            if (l.kind === "pct") return (
              <tr key={i} className="text-muted">
                <td className="py-1.5 pl-4 text-xs">{l.label}</td>
                <td className="py-1.5 text-right text-xs tabular-nums">{l.pctA == null ? "–" : `${(l.pctA * 100).toFixed(1)}%`}</td>
                {compare && <><td className="py-1.5 text-right text-xs tabular-nums">{l.pctB == null ? "–" : `${(l.pctB * 100).toFixed(1)}%`}</td><td /><td className="hidden sm:table-cell" /></>}
              </tr>
            );
            const strong = l.kind === "total" || l.kind === "grand";
            return (
              <tr key={i} className={clsx(strong && "border-t border-border font-semibold text-ink", l.kind === "grand" && "bg-surface-sunken")}>
                <td className={clsx("py-2", l.kind === "detail" ? "pl-4 text-muted" : "text-ink", l.kind === "grand" && "pl-3 font-serif text-base")}>{l.label}</td>
                <td className="py-2 text-right">{l.a == null ? "–" : <Money cents={l.a} />}</td>
                {compare && <>
                  <td className="py-2 text-right text-muted">{l.b == null ? "–" : <Money cents={l.b} />}</td>
                  {l.a != null && l.b != null ? <Delta a={l.a} b={l.b} invert={l.invert} /> : <><td /><td className="hidden sm:table-cell" /></>}
                </>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------- income statement ----------
function incomeLines(rows: StatementRow[], p: Period, is: IncomeStatement, cmp: IncomeStatement | null, cmpPeriod: Period | null): Line[] {
  const detail = (section: string, invert = false): Line[] => {
    const cur = lineDetail(rows, section, p.from, p.to);
    const prev = cmpPeriod ? new Map(lineDetail(rows, section, cmpPeriod.from, cmpPeriod.to).map((l) => [l.line, l.cents])) : null;
    return cur.map((l) => ({ label: l.line, a: l.cents, b: prev ? prev.get(l.line) ?? 0n : cmp ? null : undefined, kind: "detail" as const, invert }));
  };
  const v = (k: keyof IncomeStatement) => (cmp ? (cmp[k] as bigint) : null);
  return [
    { label: "Revenue", a: null, kind: "header" },
    ...detail("REV"),
    { label: "Total Revenue", a: is.revenueCents, b: v("revenueCents"), kind: "total" },
    { label: "Cost of Production", a: null, kind: "header" },
    ...detail("COP", true),
    { label: "Total Cost of Production", a: is.copCents, b: v("copCents"), kind: "total", invert: true },
    { label: "Gross Profit", a: is.grossProfitCents, b: v("grossProfitCents"), kind: "total" },
    { label: "Gross Margin", a: null, kind: "pct", pctA: is.grossMarginPct, pctB: cmp?.grossMarginPct ?? null },
    { label: "Overhead", a: null, kind: "header" },
    ...detail("OVH", true),
    { label: "Total Overhead", a: is.overheadCents, b: v("overheadCents"), kind: "total", invert: true },
    { label: "EBITDA", a: is.ebitdaCents, b: v("ebitdaCents"), kind: "total" },
    { label: "Depreciation", a: is.depreciationCents, b: v("depreciationCents"), invert: true },
    { label: "Operating Profit", a: is.operatingProfitCents, b: v("operatingProfitCents"), kind: "total" },
    { label: "Interest", a: is.interestCents, b: v("interestCents"), invert: true },
    { label: "Gain (Loss) on Asset Sales", a: is.gainCents, b: v("gainCents") },
    { label: "Net Income (Operating)", a: is.netIncomeOperatingCents, b: v("netIncomeOperatingCents"), kind: "total" },
    { label: "Change in Crop & Feed Inventory", a: is.inventoryChangeCents, b: v("inventoryChangeCents") },
    { label: "Change in Livestock Values", a: is.livestockChangeCents, b: v("livestockChangeCents") },
    { label: "Net Farm Income", a: is.netFarmIncomeCents, b: v("netFarmIncomeCents"), kind: "grand" },
  ];
}

async function budgetStatement(farmId: string, p: Period): Promise<IncomeStatement | null> {
  const months = await prisma.budgetMonth.findMany({ where: { farmId, monthEnd: { gt: p.from, lte: p.to } } });
  if (months.length === 0) return null;
  const s = (k: "revenueCents" | "copCents" | "overheadCents" | "depreciationCents" | "interestCents") => months.reduce((x, m) => x + m[k], 0n);
  const revenueCents = s("revenueCents"), copCents = s("copCents"), overheadCents = s("overheadCents"), depreciationCents = s("depreciationCents"), interestCents = s("interestCents");
  const grossProfitCents = revenueCents - copCents, ebitdaCents = grossProfitCents - overheadCents, operatingProfitCents = ebitdaCents - depreciationCents;
  const netIncomeOperatingCents = operatingProfitCents - interestCents;
  return {
    revenueCents, copCents, grossProfitCents, grossMarginPct: revenueCents ? Number(grossProfitCents) / Number(revenueCents) : null, overheadCents, ebitdaCents,
    depreciationCents, operatingProfitCents, interestCents, gainCents: 0n, netIncomeOperatingCents, inventoryChangeCents: 0n, livestockChangeCents: 0n,
    netFarmIncomeCents: netIncomeOperatingCents, transfersCents: 0n,
  };
}

// ---------- balance sheet ----------
function balanceLines(a: BalanceSheet, b: BalanceSheet): Line[] {
  const L = (label: string, k: keyof BalanceSheet, kind?: Line["kind"], invert?: boolean): Line => ({ label, a: a[k] as bigint, b: b[k] as bigint, kind, invert });
  const nz = (k: keyof BalanceSheet) => (a[k] as bigint) !== 0n || (b[k] as bigint) !== 0n;
  const pick = (xs: [string, keyof BalanceSheet, boolean?][]) => xs.filter(([, k]) => nz(k)).map(([l, k, inv]) => L(l, k, "detail", inv));
  return [
    { label: "Current Assets", a: null, kind: "header" },
    ...pick([["Cash", "cashCents"], ["Accounts Receivable", "arCents"], ["Prepaid Expenses", "prepaidCents"], ["Crop & Hay Inventory", "cropInventoryCents"], ["Feed Inventory", "feedCents"], ["Growing Crops", "growingCropsCents"], ["Supplies, Semen & Packaged Meat", "suppliesCents"], ["Market Livestock", "marketLivestockCents"]]),
    L("Total Current Assets", "totalCurrentAssetsCents", "total"),
    { label: "Non-Current Assets", a: null, kind: "header" },
    ...pick([["Breeding Livestock", "breedingLivestockCents"], ["Machinery & Equipment", "machineryCents"], ["Vehicles", "vehiclesCents"], ["Buildings & Improvements", "buildingsCents"], ["Land (Cost)", "landCents"]]),
    L("Total Non-Current Assets", "totalNonCurrentAssetsCents", "total"),
    L("Total Assets", "totalAssetsCents", "grand"),
    { label: "Current Liabilities", a: null, kind: "header" },
    ...pick([["Accounts Payable", "apCents", true], ["Credit Cards", "creditCardsCents", true], ["Accrued Property Tax", "accruedPropertyTaxCents", true], ["Accrued Payroll Tax", "accruedPayrollTaxCents", true], ["Customer Deposits", "customerDepositsCents", true], ["Operating Line", "operatingLineCents", true], ["Current Portion of Term Debt", "currentPortionCents", true]]),
    L("Total Current Liabilities", "totalCurrentLiabilitiesCents", "total", true),
    { label: "Non-Current Liabilities", a: null, kind: "header" },
    ...pick([["Land Loans", "landLoansCents", true], ["Equipment Loans", "equipmentLoansCents", true], ["Vehicle Loans", "vehicleLoansCents", true], ["Other Term Debt", "otherTermDebtCents", true]]),
    L("Total Liabilities", "totalLiabilitiesCents", "total", true),
    { label: "Equity", a: null, kind: "header" },
    L("Contributed Capital", "contributedCents", "detail"),
    L("Retained Earnings", "retainedCents", "detail"),
    L("Total Equity", "totalEquityCents", "grand"),
    { label: "Market Value", a: null, kind: "header" },
    L("Land at Market", "landMarketCents", "detail"),
    L("Net Worth at Market", "marketNetWorthCents", "total"),
  ];
}

function equityRollforward(rows: StatementRow[], from: Date, to: Date, opening: BalanceSheet, closing: BalanceSheet) {
  const t = (d: Date) => d.getTime();
  const nfi = incomeStatement(rows, from, to).netFarmIncomeCents;
  let contributions = 0n, distributions = 0n;
  for (const r of rows) {
    if (r.accountCode === "8040" && r.cashDate && t(r.cashDate) > t(from) && t(r.cashDate) <= t(to) && r.cashEffectCents) contributions += r.cashEffectCents;
    if ((r.accountCode === "8041" || r.accountCode === "8042") && t(r.date) > t(from) && t(r.date) <= t(to)) distributions += r.amountCents;
  }
  return { opening: opening.totalEquityCents, nfi, contributions, distributions, closing: closing.totalEquityCents };
}

export default async function StatementsPage({ searchParams }: { searchParams: Params }) {
  const farmId = await getDemoFarmId();
  const { inputs, asOf, months } = await getStatementContext(farmId);
  const view: View = searchParams.view === "balance" || searchParams.view === "cash" ? searchParams.view : "income";
  const kind: PeriodKind = PERIODS.some((p) => p.value === searchParams.period) ? (searchParams.period as PeriodKind) : "ytd";
  const compare: Compare = searchParams.compare === "year" || searchParams.compare === "budget" ? searchParams.compare : "prior";
  const at = pickMonth(months, searchParams.at, asOf);
  const p: Params = { view, period: kind, at: monthKey(at), compare };
  const monthOptions = [...months].reverse().map((m) => ({ key: monthKey(m), label: fmtMonthYear(m) }));
  const rows = inputs.rows;

  let body: React.ReactNode;
  if (view === "income") {
    const period = periodFor(kind, at);
    const cmpPeriod = compare === "budget" ? null : compare === "year" ? priorYearPeriod(period) : priorPeriod(period);
    const is = incomeStatement(rows, period.from, period.to);
    const cmp = cmpPeriod ? incomeStatement(rows, cmpPeriod.from, cmpPeriod.to) : await budgetStatement(farmId, period);
    body = (
      <>
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <LinkTabs value={kind} options={PERIODS.map((x) => ({ ...x, href: href(p, { period: x.value }) }))} />
          <LinkTabs value={compare} options={[
            { value: "prior", label: "Prior Period", href: href(p, { compare: "prior" }) },
            { value: "year", label: "Prior Year", href: href(p, { compare: "year" }) },
            { value: "budget", label: "Budget", href: href(p, { compare: "budget" }) },
          ]} />
        </div>
        <Card className="p-6">
          <StatementTable head={[period.label, cmpPeriod?.label ?? (cmp ? "Budget" : "No Budget")]} lines={incomeLines(rows, period, is, cmp, cmpPeriod)} />
        </Card>
      </>
    );
  } else if (view === "balance") {
    const priorYe = new Date(Date.UTC(at.getUTCFullYear() - 1, 11, 31));
    const base = priorYe.getTime() >= inputs.opening.asOf.getTime() ? priorYe : inputs.opening.asOf;
    const a = balanceSheetAt(inputs, at), b = balanceSheetAt(inputs, base);
    const rf = equityRollforward(rows, base, at, b, a);
    body = (
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
        <Card className="p-6"><StatementTable head={[fmtMonthYear(at), fmtMonthYear(base)]} lines={balanceLines(a, b)} /></Card>
        <div className="h-fit space-y-6 xl:sticky xl:top-6">
        <Card className="p-6">
          <h3 className="font-serif text-lg font-semibold text-ink">Equity Rollforward</h3>
          <dl className="mt-4 space-y-2 text-sm">
            {([["Opening Equity", rf.opening], ["Net Farm Income", rf.nfi], ["Contributions", rf.contributions], ["Distributions", rf.distributions]] as const).map(([k, v]) => (
              <div key={k} className="flex justify-between"><dt className="text-muted">{k}</dt><dd><Money cents={v} /></dd></div>
            ))}
            <div className="flex justify-between border-t border-border pt-2 font-semibold"><dt className="text-ink">Closing Equity</dt><dd><Money cents={rf.closing} /></dd></div>
          </dl>
          <p className={clsx("mt-4 text-xs", a.balanceCheckCents === 0n ? "text-positive" : "text-negative")}>
            {a.balanceCheckCents === 0n ? "Balanced" : <>Out of balance by <Money cents={a.balanceCheckCents} className="text-xs" /></>}
          </p>
        </Card>
        <Card className="p-6">
          <h3 className="font-serif text-lg font-semibold text-ink">Net Worth Split</h3>
          {(() => {
            const landEquity = a.landMarketCents - a.landLoansCents;
            const operating = a.marketNetWorthCents - landEquity;
            const parts: [string, bigint][] = [
              ["Land Equity (Market)", landEquity],
              ["Operating Business", operating],
            ];
            const detail: [string, bigint][] = [
              ["Livestock & Inventory", a.breedingLivestockCents + a.marketLivestockCents + a.cropInventoryCents + a.feedCents + a.growingCropsCents + a.suppliesCents],
              ["Machinery, Vehicles & Buildings", a.machineryCents + a.vehiclesCents + a.buildingsCents],
              ["Cash & Receivables", a.cashCents + a.arCents + a.prepaidCents],
              ["Non-Land Debt & Bills", -(a.totalLiabilitiesCents - a.landLoansCents)],
            ];
            return (
              <dl className="mt-4 space-y-2 text-sm">
                {parts.map(([k, v]) => <div key={k} className="flex justify-between font-medium"><dt className="text-ink">{k}</dt><dd><Money cents={v} /></dd></div>)}
                <div className="space-y-1 border-t border-border pt-2">
                  {detail.map(([k, v]) => <div key={k} className="flex justify-between text-xs"><dt className="text-muted">{k}</dt><dd><Money cents={v} className="text-xs" /></dd></div>)}
                </div>
                <div className="flex justify-between border-t border-border pt-2 font-semibold"><dt className="text-ink">Net Worth at Market</dt><dd><Money cents={a.marketNetWorthCents} /></dd></div>
              </dl>
            );
          })()}
        </Card>
        </div>
      </div>
    );
  } else {
    const period = periodFor(kind, at);
    const cf = cashFlowReport(rows, inputs.opening, period.from, period.to);
    const is = incomeStatement(rows, period.from, period.to);
    const operating = cf.sections.find((s) => s.section === "Operating")!.totalCents;
    const lines: Line[] = [{ label: "Beginning Cash", a: cf.beginningCashCents, kind: "total" }];
    for (const s of cf.sections) {
      if (s.lines.length === 0) continue;
      lines.push({ label: s.section, a: null, kind: "header" });
      for (const l of s.lines) lines.push({ label: l.cashFlowClass, a: l.cents, kind: "detail" });
      lines.push({ label: `Net ${s.section} Cash`, a: s.totalCents, kind: "total" });
    }
    lines.push({ label: "Net Change in Cash", a: cf.netCents, kind: "total" }, { label: "Ending Cash", a: cf.endingCashCents, kind: "grand" });
    body = (
      <>
        <div className="mb-5"><LinkTabs value={kind} options={PERIODS.map((x) => ({ ...x, href: href(p, { period: x.value }) }))} /></div>
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {([["Net Farm Income", is.netFarmIncomeCents], ["Operating Cash Flow", operating], ["Change in Cash", cf.netCents]] as const).map(([k, v]) => (
            <Card key={k} className="p-5">
              <p className="text-xs uppercase tracking-wider text-muted">{k}</p>
              <p className="mt-2 text-2xl font-bold"><Money cents={v} /></p>
            </Card>
          ))}
        </div>
        <Card className="p-6"><StatementTable head={[period.label]} lines={lines} /></Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Statements" action={<MonthSelect months={monthOptions} value={monthKey(at)} />} />
      <div className="mb-5">
        <LinkTabs value={view} options={[
          { value: "income", label: "Income Statement", href: href(p, { view: "income" }) },
          { value: "balance", label: "Balance Sheet", href: href(p, { view: "balance" }) },
          { value: "cash", label: "Cash Flow", href: href(p, { view: "cash" }) },
        ]} />
      </div>
      {body}
    </>
  );
}
