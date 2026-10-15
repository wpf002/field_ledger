import clsx from "clsx";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { LinkTabs } from "@/components/ui/link-tabs";
import { getDemoFarmId } from "@/lib/data";
import { getInsights, getBrief } from "@/lib/insights";
import { fmtDate } from "@/lib/format";
import type { Severity } from "@fl/db";

export const dynamic = "force-dynamic";

const SEVERITY_STYLE: Record<Severity, string> = {
  Critical: "bg-[#F3E3E0] text-negative", Warning: "bg-[#F7EFD9] text-rust", Watch: "bg-surface-sunken text-ink",
  Opportunity: "bg-[#F6EAC6] text-ink", Positive: "bg-mint text-positive",
};

export default async function InsightsPage({ searchParams }: { searchParams: { brief?: string } }) {
  const farmId = await getDemoFarmId();
  const kind = searchParams.brief === "monthly" ? "monthly" : "weekly";
  const [brief, insights] = await Promise.all([getBrief(farmId, kind), getInsights(farmId)]);

  return (
    <>
      <PageHeader title="Insights" subtitle={`As of ${fmtDate(brief.asOf)}`} />
      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <Card className="h-fit p-6">
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-xl font-semibold text-ink">Brief</h3>
            <LinkTabs value={kind} options={[{ value: "weekly", label: "Weekly", href: "/insights" }, { value: "monthly", label: "Monthly", href: "/insights?brief=monthly" }]} />
          </div>
          <ul className="mt-4 space-y-2.5 text-sm text-ink">
            {brief.lines.map((l, i) => <li key={i} title={l.sources.join(", ")}>{l.text}</li>)}
          </ul>
          {brief.actions.length > 0 && (
            <>
              <h4 className="mt-6 text-xs font-medium uppercase tracking-wider text-muted">Recommended Actions</h4>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-ink">
                {brief.actions.map((a, i) => <li key={i} title={a.sources.join(", ")}>{a.text}</li>)}
              </ol>
            </>
          )}
        </Card>
        <div className="space-y-4">
          {insights.map((i, n) => (
            <Card key={n} className="p-5">
              <div className="flex items-start justify-between gap-4">
                <h3 className="font-serif text-lg font-semibold text-ink">{i.title}</h3>
                <span className={clsx("shrink-0 rounded-pill px-2.5 py-0.5 text-xs font-medium", SEVERITY_STYLE[i.severity])}>{i.severity}</span>
              </div>
              <p className="mt-2 text-sm text-ink">{i.finding}</p>
              <p className="mt-2 text-sm text-muted">{i.recommendation}</p>
              <p className="mt-3 text-[11px] uppercase tracking-wider text-muted/80">From {i.sources.join(" · ").replace(/_/g, " ")}</p>
            </Card>
          ))}
          {insights.length === 0 && <Card className="p-8 text-center text-sm text-muted">No Findings</Card>}
        </div>
      </div>
    </>
  );
}
