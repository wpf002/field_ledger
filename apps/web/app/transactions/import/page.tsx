import { PageHeader } from "@/components/ui/page-header";
import { ImportFlow } from "@/components/import-flow";
import { getDemoFarmId } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const farmId = await getDemoFarmId();
  return (
    <>
      <PageHeader title="Import" subtitle="Bring in transactions from a bank or accounting export." />
      <ImportFlow farmId={farmId} />
    </>
  );
}
