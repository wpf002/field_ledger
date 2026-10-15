import clsx from "clsx";
import { Money } from "@/components/ui/money";
import { LinkTabs } from "@/components/ui/link-tabs";
import { Table, Th, Td, pct } from "@/components/ui/table";
import { prisma } from "@fl/db";
import { enterpriseStatements, incomeStatement, variance, priceVolume } from "@fl/core";
import { getEnterpriseContext, yearPeriod } from "@/lib/enterprise";

/** Plan vs actual by enterprise (operating basis), with the biggest misses explained. */
export async function EnterprisePlanVsActual({ farmId, year: yearParam }: { farmId: string; year?: string }) {
  const budgets = await prisma.enterpriseBudget.findMany({ where: { farmId, period: { not: "Full-year budget (reference)" } } });
  if (budgets.length === 0) return null;
  const ctx = await getEnterpriseContext(farmId);
  const years = [...new Set(budgets.map((b) => b.year))].sort((a, b) => b - a);
  const year = years.includes(Number(yearParam)) ? Number(yearParam) : years[0]!;
  const p = yearPeriod(year, ctx.asOf);
  const st = enterpriseStatements(ctx.inputs.rows, p.from, p.to);
  const total = incomeStatement(ctx.inputs.rows, p.from, p.to);
  const name = new Map(ctx.enterprises.map((e) => [e.id, e.name]));
  const rows = budgets.filter((b) => b.year === year).map((b) => {
    const s = b.enterpriseId ? st.get(b.enterpriseId) : total;
    const actRev = s?.revenueCents ?? 0n;
    const actExp = s ? s.copCents + s.overheadCents + s.depreciationCents + s.interestCents : 0n;
    const actNet = s ? s.netIncomeOperatingCents - s.gainCents : 0n;
    return {
      id: b.enterpriseId ?? "TOTAL", label: b.enterpriseId ? name.get(b.enterpriseId) ?? "Enterprise" : "Total",
      rev: variance("Revenue", b.plannedRevenueCents, actRev, "revenue"), exp: variance("Expenses", b.plannedExpensesCents, actExp, "expense"), net: variance("Net", b.plannedNetIncomeCents, actNet, "profit"),
    };
  }).sort((a, b) => (a.id === "TOTAL" ? 1 : b.id === "TOTAL" ? -1 : a.label.localeCompare(b.label)));

  // Explain the largest misses; for revenue, split price vs volume against the prior year where quantities exist.
  const misses = rows.filter((r) => r.id !== "TOTAL").flatMap((r) => [{ r, v: r.rev, k: "revenue" }, { r, v: r.exp, k: "expenses" }])
    .filter((x) => !x.v.favorable && x.v.variancePct != null && Math.abs(x.v.variancePct) >= 0.1)
    .sort((a, b) => Number((a.v.varianceCents < 0n ? -a.v.varianceCents : a.v.varianceCents) > (b.v.varianceCents < 0n ? -b.v.varianceCents : b.v.varianceCents) ? -1 : 1)).slice(0, 4);
  const prior = yearPeriod(year - 1, ctx.asOf);
  const quantities = new Map<string, { quantity: number; amountCents: bigint }[]>();
  if (misses.length) {
    const txns = await prisma.transaction.findMany({ where: { farmId, account: { section: "REV" }, quantity: { not: null }, date: { gt: prior.from, lte: p.to } }, select: { enterpriseId: true, date: true, quantity: true, amountCents: true, unit: true } });
    for (const t of txns) { const k = `${t.enterpriseId}|${t.date > p.from ? "cur" : "prior"}|${t.unit}`; quantities.set(k, [...(quantities.get(k) ?? []), { quantity: Number(t.quantity), amountCents: t.amountCents }]); }
  }
  const explain = (ent: string) => {
    const units = [...new Set([...quantities.keys()].filter((k) => k.startsWith(`${ent}|`)).map((k) => k.split("|")[2]))];
    for (const u of units) {
      const pv = priceVolume(quantities.get(`${ent}|prior|${u}`) ?? [], quantities.get(`${ent}|cur|${u}`) ?? []);
      if (pv) return `vs ${year - 1}: volume ${pv.volumePct >= 0 ? "+" : ""}${Math.round(pv.volumePct * 100)}%, price ${pv.pricePct >= 0 ? "+" : ""}${Math.round(pv.pricePct * 100)}% per ${u}`;
    }
    return null;
  };

  const cell = (v: ReturnType<typeof variance>) => (
    <>
      <Td right muted><Money cents={v.plannedCents} /></Td>
      <Td right><Money cents={v.actualCents} /></Td>
      <Td right className={clsx(v.favorable ? "text-positive" : "text-negative")}>{pct(v.variancePct)}</Td>
    </>
  );
  return (
    <div className="mb-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-serif text-xl font-semibold text-ink">Plan vs Actual by Enterprise</h3>
        <LinkTabs value={String(year)} options={years.map((y) => ({ value: String(y), label: y === ctx.asOf.getUTCFullYear() && p.partial ? `${y} YTD` : String(y), href: `/budgets?year=${y}` }))} />
      </div>
      {misses.length > 0 && (
        <ul className="mb-4 space-y-1 text-sm">
          {misses.map((m, i) => {
            const ex = m.k === "revenue" ? explain(m.r.id) : null;
            return <li key={i} className="text-ink"><span className="font-medium">{m.r.label}</span> {m.k} are {pct(Math.abs(m.v.variancePct!))} {m.v.varianceCents > 0n ? "over" : "under"} plan{ex ? ` (${ex})` : ""}.</li>;
          })}
        </ul>
      )}
      <Table minWidth={1000}>
        <thead><tr><Th>Enterprise</Th><Th right>Plan Revenue</Th><Th right>Actual</Th><Th right>Var</Th><Th right>Plan Expenses</Th><Th right>Actual</Th><Th right>Var</Th><Th right>Plan Net</Th><Th right>Actual</Th><Th right>Var</Th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={clsx("border-t border-border", r.id === "TOTAL" && "font-semibold")}>
              <Td className="min-w-[220px]" strong={r.id === "TOTAL"}>{r.label}</Td>{cell(r.rev)}{cell(r.exp)}{cell(r.net)}
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
