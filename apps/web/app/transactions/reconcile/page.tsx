import { PageHeader } from "@/components/ui/page-header";
import { ReconcileFlow } from "@/components/reconcile-flow";
import { getDemoFarmId } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ReconcilePage() {
  const farmId = await getDemoFarmId();
  return (
    <>
      <PageHeader title="Reconcile" subtitle="Match a bank statement against your ledger." />
      <ReconcileFlow farmId={farmId} />
    </>
  );
}
