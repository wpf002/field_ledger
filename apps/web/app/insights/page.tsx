import { Upgrade } from "@/components/ui/upgrade";
import { hasFeature } from "@fl/core";
import clsx from "clsx";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { LinkTabs } from "@/components/ui/link-tabs";
import { getDemoFarmId, getPlan } from "@/lib/data";
import { getInsights, getBrief } from "@/lib/insights";
import { fmtDate } from "@/lib/format";
import type { Severity } from "@fl/db";

export const dynamic = "force-dynamic";

const SEVERITY_STYLE: Record<Severity, string> = {
  Critical: "bg-[#F3E3E0] text-negative", Warning: "bg-[#F7EFD9] text-rust", Watch: "bg-surface-sunken text-ink",
  Opportunity: "bg-[#F6EAC6] text-ink", Positive: "bg-mint text-positive",
};

const SEVERITIES: Severity[] = ["Critical", "Warning", "Watch", "Opportunity", "Positive"];

export default async function InsightsPage({ searchParams }: { searchParams: { brief?: string; sev?: string } }) {
  const farmId = await getDemoFarmId();
  if (!hasFeature(await getPlan(), "insights")) return (<><PageHeader title="Insights" /><Upgrade feature="insights" title="Insights" /></>);
  const kind = searchParams.brief === "monthly" ? "monthly" : "weekly";
  const [brief, insights] = await Promise.all([getBrief(farmId, kind), getInsights(farmId)]);
  const sev = SEVERITIES.find((x) => x === searchParams.sev);
  const shown = sev ? insights.filter((i) => i.severity === sev) : insights;
  const href = (p: { brief?: string; sev?: string }) => {
    const q = new URLSearchParams();
    const b = p.brief ?? (kind === "monthly" ? "monthly" : undefined), v = "sev" in p ? p.sev : sev;
    if (b) q.set("brief", b);
    if (v) q.set("sev", v);
    return `/insights${q.size ? `?${q}` : ""}`;
  };

  return (
    <>
      <PageHeader title="Insights" subtitle={`As of ${fmtDate(brief.asOf)}`} />
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-serif text-xl font-semibold text-ink">Brief</h3>
          <LinkTabs value={kind} options={[{ value: "weekly", label: "Weekly", href: href({ brief: "" }) }, { value: "monthly", label: "Monthly", href: href({ brief: "monthly" }) }]} />
        </div>
        <div className="mt-4 grid gap-6 lg:grid-cols-2 lg:gap-10">
          <ul className="space-y-2.5 text-sm text-ink">
            {brief.lines.map((l, i) => <li key={i} title={l.sources.join(", ")}>{l.text}</li>)}
          </ul>
          {brief.actions.length > 0 && (
            <div className="lg:border-l lg:border-border lg:pl-10">
              <h4 className="text-xs font-medium uppercase tracking-wider text-muted">Recommended Actions</h4>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-ink">
                {brief.actions.map((a, i) => <li key={i} title={a.sources.join(", ")}>{a.text}</li>)}
              </ol>
            </div>
          )}
        </div>
      </Card>

      <div className="mt-8 mb-4">
        <LinkTabs value={sev ?? "all"} options={[
          { value: "all", label: `All ${insights.length}`, href: href({ sev: undefined }) },
          ...SEVERITIES.map((x) => ({ x, n: insights.filter((i) => i.severity === x).length })).filter((o) => o.n > 0)
            .map((o) => ({ value: o.x, label: `${o.x} ${o.n}`, href: href({ sev: o.x }) })),
        ]} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {shown.map((i, n) => (
          <Card key={n} className="flex flex-col p-5">
            <div className="flex items-start justify-between gap-4">
              <h3 className="font-serif text-lg font-semibold text-ink">{i.title}</h3>
              <span className={clsx("shrink-0 rounded-pill px-2.5 py-0.5 text-xs font-medium", SEVERITY_STYLE[i.severity])}>{i.severity}</span>
            </div>
            <p className="mt-2 text-sm text-ink">{i.finding}</p>
            <p className="mt-2 text-sm text-muted">{i.recommendation}</p>
            <p className="mt-auto pt-3 text-[11px] uppercase tracking-wider text-muted/80">From {i.sources.join(" · ").replace(/_/g, " ")}</p>
          </Card>
        ))}
        {shown.length === 0 && <Card className="p-8 text-center text-sm text-muted lg:col-span-2">No Findings</Card>}
      </div>
    </>
  );
}
