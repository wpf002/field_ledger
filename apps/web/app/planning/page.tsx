import { Upgrade } from "@/components/ui/upgrade";
import { hasFeature } from "@fl/core";
import { PageHeader } from "@/components/ui/page-header";
import { NewPlanButton } from "@/components/new-plan-button";
import { PlanningView, type PlanLite } from "@/components/planning-view";
import { prisma } from "@fl/db";
import { getDemoFarmId, getPlan } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function PlanningPage() {
  const farmId = await getDemoFarmId();
  if (!hasFeature(await getPlan(), "planning")) return (<><PageHeader title="Planning" /><Upgrade feature="planning" title="Planning" /></>);
  const plans = await prisma.productionPlan.findMany({ where: { farmId }, orderBy: { startAt: "asc" } });
  const lite: PlanLite[] = plans.map((p) => ({
    id: p.id, title: p.title, kind: p.kind,
    startAt: p.startAt.toISOString(), endAt: p.endAt?.toISOString() ?? null,
  }));

  return (
    <>
      <PageHeader
        title="Production Planning"
        action={<NewPlanButton farmId={farmId} />}
      />
      <PlanningView plans={lite} />
    </>
  );
}
