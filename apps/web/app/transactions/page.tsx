import { TransactionsClient, type Txn, type Account } from "@/components/transactions-client";
import { getDemoFarmId, getCurrentRole, canWrite } from "@/lib/data";
import { apiFetch } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const farmId = await getDemoFarmId();
  const [txnsRes, acctsRes] = await Promise.all([
    apiFetch(`/farms/${farmId}/transactions`),
    apiFetch(`/farms/${farmId}/accounts`),
  ]);
  const initial: Txn[] = await txnsRes.json();
  const accounts: Account[] = await acctsRes.json();
  const writable = canWrite(await getCurrentRole());

  return <TransactionsClient farmId={farmId} initial={initial} accounts={accounts} canWrite={writable} />;
}
