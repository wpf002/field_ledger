import { AssistantView } from "@/components/assistant-view";
import { PageHeader } from "@/components/ui/page-header";
import { getDemoFarmId } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const farmId = await getDemoFarmId();
  return (
    <>
      <PageHeader title="Assistant" />
      <AssistantView farmId={farmId} />
    </>
  );
}
