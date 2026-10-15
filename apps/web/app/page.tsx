import Link from "next/link";
import clsx from "clsx";
import { StatCard } from "@/components/ui/stat-card";
import { HeroBand } from "@/components/ui/hero-band";
import { Money } from "@/components/ui/money";
import { Card, SectionHeading } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { CashFlowChart } from "@/components/charts/cash-flow-chart";
import { prisma } from "@fl/db";
import { getDemoFarmId } from "@/lib/data";
import { getBudgetStatuses } from "@/lib/budgets";
import { getFinancialSnapshot, cashTrend } from "@/lib/snapshot";
import { BudgetBar } from "@/components/budget-bar";
import { fmtDate, fmtMonthYear } from "@/lib/format";
import { Wallet, Landmark, Scale, Sprout, DollarSign, Banknote, ArrowUpRight, ArrowDownRight, Sparkles, FileSpreadsheet } from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = { Strong: "text-white", Healthy: "text-white", Watch: "text-[#F6EAC6]", Weak: "text-[#F3C9C0]" };
const fmtRatio = (v: number | null) => (v == null ? "–" : v.toFixed(2));
const fmtPct = (v: number | null) => (v == null ? "–" : `${(v * 100).toFixed(1)}%`);

export default async function Dashboard() {
  const farmId = await getDemoFarmId();
  const [snap, budgetStatuses] = await Promise.all([getFinancialSnapshot(farmId), getBudgetStatuses(farmId)]);
  const { bs, isYtd, isMonth, ratios, health, asOf } = snap;
  const recent = await prisma.transaction.findMany({
    where: { farmId, entryType: "ledger", date: { lte: asOf }, account: { kind: { not: "BALANCE" } } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 5, include: { account: true },
  });
  const trend = cashTrend(snap.rows, snap.opening, asOf);
  const workingCapital = bs.totalCurrentAssetsCents - bs.totalCurrentLiabilitiesCents;

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle={`As of ${fmtDate(asOf)}`}
        action={<Link href="/statements" className="inline-flex items-center gap-2 rounded-btn border border-border px-4 py-2.5 text-sm text-ink hover:bg-tag/40"><FileSpreadsheet size={15} /> Statements</Link>}
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="grid grid-cols-2 gap-5 lg:col-span-2 xl:grid-cols-3">
          <StatCard label="Cash" value={<Money cents={bs.cashCents} />} sub={snap.lineLimitCents > 0n ? `Line available ${fmtK(snap.lineAvailableCents)}` : undefined} icon={<Wallet size={18} className="text-muted" />} />
          <StatCard label="Working Capital" value={<Money cents={workingCapital} />} sub={`Current ratio ${fmtRatio(ratios.currentRatio)}`} icon={<Scale size={18} className="text-muted" />} />
          <StatCard label="Revenue YTD" value={<Money cents={isYtd.revenueCents} />} sub={`${fmtMonthYear(asOf).split(" ")[0]} ${fmtK(isMonth.revenueCents)}`} icon={<DollarSign size={18} className="text-muted" />} />
          <StatCard label="Net Farm Income YTD" value={<Money cents={isYtd.netFarmIncomeCents} />} sub={`Gross margin ${fmtPct(isYtd.grossMarginPct)}`} icon={<Sprout size={18} className="text-muted" />} />
          <StatCard label="Debt" value={<Money cents={snap.interestBearingDebtCents} />} sub={snap.annualDebtServiceCents > 0n ? `Debt service ${fmtK(snap.annualDebtServiceCents)}/yr` : undefined} icon={<Landmark size={18} className="text-muted" />} />
          <StatCard label="Inventory" value={<Money cents={snap.inventoryValueCents} />} sub="Crops, feed & livestock" icon={<Banknote size={18} className="text-muted" />} />
        </div>

        {/* Health score fills the height of the stat block. */}
        <Link href="/health" className="group flex flex-col rounded-card bg-primary p-6 text-white shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-white/80">Financial Health</span>
            <span className="text-xs text-white/70 group-hover:text-white">Details</span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-serif text-5xl font-bold tabular-nums">{health.overall}</span>
            <span className="text-white/70">/ 100</span>
            <span className={clsx("ml-auto text-sm font-medium", STATUS_TONE[health.status])}>{health.status}</span>
          </div>
          <div className="mt-5 flex-1 space-y-3">
            {health.categories.map((c) => (
              <div key={c.key}>
                <div className="flex justify-between text-sm"><span className="text-white/85">{c.label}</span><span className={clsx("font-medium", STATUS_TONE[c.status])}>{c.status}</span></div>
                <div className="mt-1 h-1.5 rounded-pill bg-white/15"><div className="h-full rounded-pill bg-gold" style={{ width: `${c.score}%` }} /></div>
              </div>
            ))}
          </div>
        </Link>
      </div>

      <Card className="mt-6 grid grid-cols-2 gap-x-4 gap-y-4 p-5 sm:grid-cols-3 xl:grid-cols-6">
        {([
          ["Receivables", bs.arCents], ["Payables", bs.apCents + bs.creditCardsCents], ["Gross Profit YTD", isYtd.grossProfitCents],
          ["EBITDA YTD", isYtd.ebitdaCents], ["Operating Profit YTD", isYtd.operatingProfitCents], ["Due in 90 Days", snap.obligations90Cents],
        ] as const).map(([k, v]) => (
          <div key={k}>
            <p className="text-xs uppercase tracking-wider text-muted">{k}</p>
            <p className="mt-1 text-lg font-bold text-ink"><Money cents={v} /></p>
          </div>
        ))}
      </Card>

      <div className="mt-6">
        <HeroBand title="Net Worth" subtitle={`Book ${fmtK(bs.totalEquityCents)} · land at market`} value={<Money cents={bs.marketNetWorthCents} className="text-white" />} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <SectionHeading title="Operating Cash" action={<Link href="/statements?view=cash&period=ttm" className="text-sm text-muted hover:text-ink">Cash Flow</Link>} />
          <div className="mt-4"><CashFlowChart data={trend} /></div>
        </Card>

        <Card className="flex flex-col p-6">
          <SectionHeading title="Recent Activity" action={<Link href="/transactions" className="text-sm text-muted hover:text-ink">View All</Link>} />
          <div className="mt-4 flex-1 space-y-5">
            {recent.map((t) => {
              const positive = t.amountCents > 0n;
              return (
                <div key={t.id} className="flex items-start gap-3">
                  <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${positive ? "bg-mint text-positive" : "bg-[#F3E3E0] text-negative"}`}>
                    {positive ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{t.description}</p>
                    <p className="text-xs text-muted">{t.account.label} · {fmtDate(t.date)}</p>
                  </div>
                  <Money cents={t.amountCents} sign className="text-sm" />
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-6 lg:col-span-2">
          <SectionHeading title="Budget Health" action={<Link href="/budgets" className="text-sm text-muted hover:text-ink">View All</Link>} />
          <div className="mt-4 space-y-4">
            {budgetStatuses.slice(0, 4).map((b) => <BudgetBar key={b.id} status={b.status} />)}
            {budgetStatuses.length === 0 && <p className="pt-2 text-center text-sm text-muted">No Budgets Set</p>}
          </div>
        </Card>

        <Card className="flex flex-col p-6">
          <SectionHeading icon={<Sparkles size={18} className="text-rust" />} title="AI Insights" action={<Link href="/assistant" className="rounded-btn border border-border px-3 py-1.5 text-sm text-ink hover:bg-tag/40">Ask</Link>} />
          <div className="flex flex-1 items-center justify-center">
            <p className="py-6 text-center text-sm text-muted">No Insights Yet</p>
          </div>
        </Card>
      </div>
    </>
  );
}

/** Compact dollars for sub-labels: $12.3k, $1.2M. */
function fmtK(cents: bigint) {
  const d = Number(cents) / 100;
  const a = Math.abs(d), s = d < 0 ? "-" : "";
  return a >= 1e6 ? `${s}$${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${s}$${(a / 1e3).toFixed(1)}k` : `${s}$${a.toFixed(0)}`;
}
