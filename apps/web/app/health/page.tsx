import clsx from "clsx";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { getDemoFarmId } from "@/lib/data";
import { getFinancialSnapshot } from "@/lib/snapshot";
import { fmtDate } from "@/lib/format";
import type { HealthStatus } from "@fl/core";

export const dynamic = "force-dynamic";

const HERO_PILL: Record<HealthStatus, string> = {
  Strong: "bg-white text-primary", Healthy: "bg-white text-primary", Watch: "bg-gold text-ink", Weak: "bg-rust text-white",
};
const fmt = (v: number | null, f: "ratio" | "pct") => (v == null || !Number.isFinite(v) ? "–" : f === "pct" ? `${(v * 100).toFixed(1)}%` : v.toFixed(2));

export default async function HealthPage() {
  const farmId = await getDemoFarmId();
  const s = await getFinancialSnapshot(farmId);
  const { health, ratios, bs } = s;

  const liquidity: [string, React.ReactNode][] = [
    ["Current Assets", <Money key="a" cents={bs.totalCurrentAssetsCents} />],
    ["Current Liabilities", <Money key="b" cents={bs.totalCurrentLiabilitiesCents} />],
    ["Working Capital", <Money key="c" cents={ratios.workingCapitalCents} />],
    ["Current Ratio", fmt(ratios.currentRatio, "ratio")],
    ["Working Capital / Revenue", fmt(ratios.workingCapitalToGrossRevenue, "pct")],
    ["Line Available", s.lineLimitCents > 0n ? <Money key="d" cents={s.lineAvailableCents} /> : "–"],
    ["Due in 90 Days", <Money key="e" cents={s.obligations90Cents} />],
  ];
  const measure = (key: string, label: string) => {
    const m = health.categories.find((c) => c.key === key)?.measures.find((x) => x.label === label);
    return m ? fmt(m.value, m.format) : "–";
  };
  const repayment: [string, React.ReactNode][] = [
    ["Repayment Capacity", <Money key="a" cents={ratios.capitalDebtRepaymentCapacityCents} />],
    ["Scheduled Payments", <Money key="b" cents={ratios.capitalDebtRepaymentCapacityCents - ratios.repaymentMarginCents} />],
    ["Margin", <Money key="c" cents={ratios.repaymentMarginCents} />],
    ["Term Debt Coverage", measure("repayment", "Term Debt Coverage")],
    ["Owner Labor Charge", <Money key="d" cents={ratios.ownerLaborCents} />],
  ];
  const detail: [string, React.ReactNode][] = [
    ["Debt to Equity", measure("solvency", "Debt to Equity")], ["Operating Margin", measure("profitability", "Operating Margin")],
    ["Debt to Assets (Market)", fmt(ratios.debtToAssetMarket, "pct")], ["Equity to Assets", fmt(ratios.equityToAsset, "pct")],
    ["Return on Assets (Market)", fmt(ratios.returnOnAssetsMarket, "pct")], ["Return on Equity", fmt(ratios.returnOnEquity, "pct")],
    ["Depreciation Expense Ratio", fmt(ratios.depreciationExpenseRatio, "pct")], ["Interest Expense Ratio", fmt(ratios.interestExpenseRatio, "pct")],
    ["Net Farm Income Ratio", fmt(ratios.netFarmIncomeRatio, "pct")],
  ];

  return (
    <>
      <PageHeader title="Health" subtitle={`Trailing 12 months to ${fmtDate(s.asOf)}`} />

      <div className="grid gap-8 rounded-card bg-primary p-6 text-white shadow-card sm:p-8 lg:grid-cols-[minmax(0,240px)_1fr]">
        <div className="flex flex-col justify-center">
          <span className="text-xs uppercase tracking-wider text-white/70">Overall</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-serif text-6xl font-bold tabular-nums">{health.overall}</span>
            <span className="text-white/60">/ 100</span>
          </div>
          <span className={clsx("mt-3 w-fit rounded-pill px-3 py-1 text-sm font-medium", HERO_PILL[health.status])}>{health.status}</span>
        </div>
        <dl className="grid content-center gap-4">
          {health.categories.map((c) => (
            <div key={c.key} className="grid grid-cols-[130px_1fr_36px] items-center gap-4 text-sm sm:grid-cols-[170px_1fr_40px]">
              <dt className="text-white/85">{c.label}</dt>
              <dd className="h-2 rounded-pill bg-white/15"><div className={clsx("h-full rounded-pill", c.score >= 60 ? "bg-white" : "bg-gold")} style={{ width: `${c.score}%` }} /></dd>
              <dd className="text-right font-medium tabular-nums">{c.score}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Section title="Liquidity" rows={liquidity} />
        <Section title="Repayment" rows={repayment} />
        <Section title="Ratios" rows={detail} />
      </div>
    </>
  );
}

function Section({ title, rows }: { title: string; rows: [string, React.ReactNode][] }) {
  return (
    <Card className="p-6">
      <h3 className="font-serif text-lg font-semibold text-ink">{title}</h3>
      <dl className="mt-3 divide-y divide-border text-sm">
        {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-4 py-2"><dt className="text-muted">{k}</dt><dd className="tabular-nums text-ink">{v}</dd></div>)}
      </dl>
    </Card>
  );
}
