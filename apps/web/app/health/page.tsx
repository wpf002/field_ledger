import clsx from "clsx";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { getDemoFarmId } from "@/lib/data";
import { getFinancialSnapshot } from "@/lib/snapshot";
import { fmtDate } from "@/lib/format";
import type { HealthStatus } from "@fl/core";

export const dynamic = "force-dynamic";

const PILL: Record<HealthStatus, string> = {
  Strong: "bg-mint text-positive", Healthy: "bg-mint text-primary", Watch: "bg-[#F6EAC6] text-ink", Weak: "bg-[#F3E3E0] text-negative",
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
  const detail: [string, string][] = [
    ["Debt to Assets (Market)", fmt(ratios.debtToAssetMarket, "pct")], ["Equity to Assets", fmt(ratios.equityToAsset, "pct")],
    ["Return on Assets (Market)", fmt(ratios.returnOnAssetsMarket, "pct")], ["Return on Equity", fmt(ratios.returnOnEquity, "pct")],
    ["Depreciation Expense Ratio", fmt(ratios.depreciationExpenseRatio, "pct")], ["Interest Expense Ratio", fmt(ratios.interestExpenseRatio, "pct")],
    ["Net Farm Income Ratio", fmt(ratios.netFarmIncomeRatio, "pct")],
  ];

  return (
    <>
      <PageHeader title="Health" subtitle={`Trailing 12 months to ${fmtDate(s.asOf)}`} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col justify-between rounded-card bg-primary p-6 text-white shadow-card">
          <span className="text-xs uppercase tracking-wider text-white/80">Overall</span>
          <div className="my-6 flex items-baseline gap-2">
            <span className="font-serif text-6xl font-bold tabular-nums">{health.overall}</span>
            <span className="text-white/70">/ 100</span>
          </div>
          <span className="text-lg font-medium">{health.status}</span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-2">
          {health.categories.map((c) => (
            <Card key={c.key} className="p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-serif text-lg font-semibold text-ink">{c.label}</h3>
                <span className={clsx("rounded-pill px-2.5 py-0.5 text-xs font-medium", PILL[c.status])}>{c.status}</span>
              </div>
              <div className="mt-2 h-1.5 rounded-pill bg-surface-sunken"><div className="h-full rounded-pill bg-primary" style={{ width: `${c.score}%` }} /></div>
              <dl className="mt-3 space-y-1 text-sm">
                {c.measures.map((m) => (
                  <div key={m.label} className="flex justify-between"><dt className="text-muted">{m.label}</dt><dd className="font-medium tabular-nums text-ink">{fmt(m.value, m.format)}</dd></div>
                ))}
              </dl>
            </Card>
          ))}
          <Card className="p-5">
            <h3 className="font-serif text-lg font-semibold text-ink">Repayment</h3>
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Repayment Capacity</dt><dd><Money cents={ratios.capitalDebtRepaymentCapacityCents} /></dd></div>
              <div className="flex justify-between"><dt className="text-muted">Scheduled Payments</dt><dd><Money cents={ratios.capitalDebtRepaymentCapacityCents - ratios.repaymentMarginCents} /></dd></div>
              <div className="flex justify-between font-medium"><dt className="text-ink">Margin</dt><dd><Money cents={ratios.repaymentMarginCents} /></dd></div>
            </dl>
          </Card>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h3 className="font-serif text-lg font-semibold text-ink">Liquidity</h3>
          <dl className="mt-3 divide-y divide-border text-sm">
            {liquidity.map(([k, v]) => <div key={k} className="flex justify-between py-2"><dt className="text-muted">{k}</dt><dd className="tabular-nums text-ink">{v}</dd></div>)}
          </dl>
        </Card>
        <Card className="p-6">
          <h3 className="font-serif text-lg font-semibold text-ink">More Ratios</h3>
          <dl className="mt-3 divide-y divide-border text-sm">
            {detail.map(([k, v]) => <div key={k} className="flex justify-between py-2"><dt className="text-muted">{k}</dt><dd className="tabular-nums text-ink">{v}</dd></div>)}
            <div className="flex justify-between py-2"><dt className="text-muted">Owner Labor Charge</dt><dd><Money cents={ratios.ownerLaborCents} /></dd></div>
          </dl>
        </Card>
      </div>
    </>
  );
}
