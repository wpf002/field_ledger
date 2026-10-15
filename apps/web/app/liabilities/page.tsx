import clsx from "clsx";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, SectionHeading } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { LiabilitySchedule } from "@/components/liability-schedule";
import { AddLiabilityButton } from "@/components/add-liability-button";
import { EmptyState } from "@/components/ui/empty-state";
import { prisma } from "@fl/db";
import { getDemoFarmId, getCurrentRole, canWrite } from "@/lib/data";
import { getFinancialSnapshot } from "@/lib/snapshot";
import { sumCents, amortizationSchedule, type Freq } from "@fl/core";
import { fmtDate, fmtMonthYear } from "@/lib/format";
import { Wallet, CalendarClock } from "lucide-react";

export const dynamic = "force-dynamic";

const GROUP = (l: { type: string; debtType: string | null }) =>
  l.type === "OPERATING_LINE" ? "Operating" : l.type === "MORTGAGE" || l.debtType === "Land loan" ? "Land"
  : l.type === "EQUIPMENT_LOAN" ? "Equipment & Vehicles" : "Other";
const FREQ_LABEL: Record<string, string> = { monthly: "Monthly", quarterly: "Quarterly", semiannual: "Semiannual", annual: "Annual" };
const fmtR = (v: number | null) => (v == null || !Number.isFinite(v) ? "–" : v.toFixed(2));
const fmtP = (v: number | null) => (v == null || !Number.isFinite(v) ? "–" : `${(v * 100).toFixed(1)}%`);

export default async function DebtPage() {
  const farmId = await getDemoFarmId();
  const canEdit = canWrite(await getCurrentRole());
  const [liabilities, snap] = await Promise.all([
    prisma.liability.findMany({ where: { farmId }, include: { schedule: { orderBy: { number: "asc" } } }, orderBy: [{ type: "asc" }, { createdAt: "asc" }] }),
    getFinancialSnapshot(farmId),
  ]);
  const { ratios, bs } = snap;
  // Debt is dated today: balances, next payments, and payments to date follow each loan's
  // schedule (scheduled payments are treated as made). Ratios still come from the books.
  const now = new Date();
  const asOf = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const t = asOf.getTime();
  const rowsOf = (l: (typeof liabilities)[number]) => l.schedule.length
    ? l.schedule.map((r) => ({ dueDate: r.dueDate, paymentCents: r.paymentCents ?? r.principalCents, principalCents: r.principalCents, interestCents: (r.paymentCents ?? r.principalCents) - r.principalCents, balanceAfterCents: r.endingBalanceCents }))
    : l.type !== "OPERATING_LINE" && l.nextPaymentAt && l.paymentCents
      ? amortizationSchedule({ balanceCents: l.balanceCents, annualRatePct: Number(l.ratePct), paymentCents: l.paymentCents, firstDueDate: l.nextPaymentAt, freq: l.paymentFreq as Freq }, 360)
      : [];
  const current = new Map(liabilities.map((l) => {
    const rows = rowsOf(l);
    const past = rows.filter((r) => r.dueDate.getTime() <= t);
    const balance = l.type === "OPERATING_LINE" || !rows.length ? l.balanceCents
      : past.length ? past[past.length - 1]!.balanceAfterCents ?? l.balanceCents
      : l.schedule.length ? l.originalCents : l.balanceCents;
    return [l.id, { rows, balance, next: rows.find((r) => r.dueDate.getTime() > t)?.dueDate ?? (l.nextPaymentAt && l.nextPaymentAt.getTime() > t ? l.nextPaymentAt : null) }];
  }));
  const yearOut = t + 365 * 86_400_000;
  const debtService = sumCents(liabilities.flatMap((l) => current.get(l.id)!.rows.filter((r) => r.dueDate.getTime() > t && r.dueDate.getTime() <= yearOut).map((r) => r.paymentCents)));

  // Future principal by calendar year. Imported loans carry schedules; others are amortized.
  const maturity = new Map<number, bigint>();
  const add = (y: number, c: bigint) => maturity.set(y, (maturity.get(y) ?? 0n) + c);
  for (const l of liabilities) {
    if (l.type === "OPERATING_LINE") { if (l.balanceCents > 0n) add((l.maturityAt ?? asOf).getUTCFullYear(), l.balanceCents); continue; }
    for (const r of current.get(l.id)!.rows) if (r.dueDate.getTime() > t) add(r.dueDate.getUTCFullYear(), r.principalCents);
  }
  const years = [...maturity.entries()].sort((a, b) => a[0] - b[0]);
  const maxYear = years.reduce((m, [, c]) => (c > m ? c : m), 0n);

  const groups = new Map<string, bigint>();
  for (const l of liabilities) groups.set(GROUP(l), (groups.get(GROUP(l)) ?? 0n) + current.get(l.id)!.balance);
  const total = sumCents(liabilities.map((l) => current.get(l.id)!.balance));
  const ytdStart = new Date(Date.UTC(asOf.getUTCFullYear(), 0, 1)).getTime();
  const paidYtd = (k: "interestCents" | "principalCents") => sumCents(liabilities.flatMap((l) => current.get(l.id)!.rows.filter((s) => s.dueDate.getTime() >= ytdStart && s.dueDate.getTime() <= t).map((s) => s[k])));

  return (
    <>
      <PageHeader title="Debt" subtitle={`As of ${fmtDate(asOf)}`} action={canEdit ? <AddLiabilityButton farmId={farmId} /> : undefined} />

      {liabilities.length === 0 ? (
        <EmptyState icon={<Wallet size={22} />} title="No Loans" action={canEdit ? <AddLiabilityButton farmId={farmId} /> : undefined} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-5 xl:grid-cols-4">
            <StatCard label="Total Debt" value={<Money cents={total} className="text-white" />} sub={`${liabilities.length} loan${liabilities.length === 1 ? "" : "s"}`} variant="brown" />
            <StatCard label="Debt Service" value={<Money cents={debtService} />} sub="Next 12 months" />
            <StatCard label="Interest YTD" value={<Money cents={paidYtd("interestCents")} />} sub={<>Principal <Money cents={paidYtd("principalCents")} className="text-sm" /></>} />
            <StatCard label="Debt Coverage" value={fmtR(ratios.termDebtCoverage)} sub="Trailing 12 months" />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Card className="p-6">
              <SectionHeading title="By Type" />
              <div className="mt-4 space-y-3">
                {[...groups.entries()].map(([g, c]) => (
                  <div key={g}>
                    <div className="flex justify-between text-sm"><span className="text-ink">{g}</span><Money cents={c} /></div>
                    <div className="mt-1 h-1.5 rounded-pill bg-surface-sunken"><div className="h-full rounded-pill bg-brown" style={{ width: `${total ? Number((c * 100n) / total) : 0}%` }} /></div>
                  </div>
                ))}
              </div>
              <dl className="mt-6 space-y-1.5 border-t border-border pt-4 text-sm">
                {([["Debt to Assets", fmtP(ratios.debtToAsset)], ["Equity to Assets", fmtP(ratios.equityToAsset)], ["Debt to Equity", fmtR(ratios.debtToEquity)], ["Operating Line Used", snap.lineLimitCents ? fmtP(Number(bs.operatingLineCents) / Number(snap.lineLimitCents)) : "–"]] as const).map(([k, v]) => (
                  <div key={k} className="flex justify-between"><dt className="text-muted">{k}</dt><dd className="tabular-nums text-ink">{v}</dd></div>
                ))}
              </dl>
            </Card>

            <Card className="p-6 lg:col-span-2">
              <SectionHeading icon={<CalendarClock size={18} className="text-primary" />} title="Principal Due by Year" />
              <div className="mt-4 space-y-2">
                {years.slice(0, 10).map(([y, c]) => (
                  <div key={y} className="grid grid-cols-[48px_1fr_110px] items-center gap-3 text-sm">
                    <span className="text-muted">{y}</span>
                    <div className="h-3 rounded-pill bg-surface-sunken"><div className="h-full rounded-pill bg-primary" style={{ width: `${maxYear ? Math.max(2, Number((c * 100n) / maxYear)) : 0}%` }} /></div>
                    <span className="text-right"><Money cents={c} /></span>
                  </div>
                ))}
                {years.length > 10 && <p className="pt-1 text-xs text-muted">Later: <Money cents={sumCents(years.slice(10).map(([, c]) => c))} className="text-xs" /></p>}
              </div>
            </Card>
          </div>

          <Card className="mt-6 overflow-x-auto p-2 sm:p-4">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted">
                  <th className="px-3 py-2 font-medium">Loan</th><th className="px-3 py-2 font-medium">Type</th><th className="px-3 py-2 text-right font-medium">Original</th>
                  <th className="px-3 py-2 text-right font-medium">Balance</th><th className="px-3 py-2 text-right font-medium">Rate</th><th className="px-3 py-2 text-right font-medium">Payment</th>
                  <th className="px-3 py-2 font-medium">Next</th><th className="px-3 py-2 font-medium">Maturity</th><th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {liabilities.map((l) => (
                  <tr key={l.id} className="border-t border-border align-top">
                    <td className="px-3 py-3">
                      <p className="font-medium text-ink">{l.name}</p>
                      <p className="text-xs text-muted">{l.lender ?? "–"}</p>
                      {l.collateral && <p className="max-w-[240px] truncate text-xs text-muted" title={l.collateral}>{l.collateral}</p>}
                    </td>
                    <td className="px-3 py-3 text-muted">{l.debtType ?? GROUP(l)}</td>
                    <td className="px-3 py-3 text-right"><Money cents={l.limitCents ?? l.originalCents} /></td>
                    <td className="px-3 py-3 text-right font-medium"><Money cents={current.get(l.id)!.balance} /></td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-ink">{Number(l.ratePct).toFixed(2)}%<p className={clsx("text-xs", l.rateType?.startsWith("Variable") ? "text-rust" : "text-muted")}>{l.rateType?.split(" ")[0] ?? "Fixed"}</p></td>
                    <td className="whitespace-nowrap px-3 py-3 text-right">{l.paymentCents ? <><Money cents={l.paymentCents} /><p className="text-xs text-muted">{FREQ_LABEL[l.paymentFreq] ?? l.paymentFreq}</p></> : <span className="text-muted">Revolving</span>}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted">{current.get(l.id)!.next ? fmtDate(current.get(l.id)!.next!) : "–"}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted">{l.maturityAt ? fmtMonthYear(l.maturityAt) : "–"}</td>
                    <td className="px-3 py-3"><LiabilitySchedule farmId={farmId} id={l.id} name={l.name} nextPaymentAt={l.nextPaymentAt?.toISOString() ?? null} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </>
  );
}
