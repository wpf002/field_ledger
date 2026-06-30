import { PageHeader } from "@/components/ui/page-header";
import { NewPlanButton } from "@/components/new-plan-button";
import { PlanningView, type PlanLite } from "@/components/planning-view";
import { prisma } from "@fl/db";
import { getDemoFarmId } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function PlanningPage() {
  const farmId = await getDemoFarmId();
  const plans = await prisma.productionPlan.findMany({ where: { farmId }, orderBy: { startAt: "asc" } });
  const lite: PlanLite[] = plans.map((p) => ({
    id: p.id, title: p.title, kind: p.kind,
    startAt: p.startAt.toISOString(), endAt: p.endAt?.toISOString() ?? null,
  }));

  return (
    <>
      <PageHeader
        title="Production Planning"
        subtitle="Manage livestock and crop production cycles."
        action={<NewPlanButton farmId={farmId} />}
      />
      <PlanningView plans={lite} />
    </>
  );
}
