import { TransactionsClient, type Txn, type Account } from "@/components/transactions-client";
import { getDemoFarmId, getCurrentRole, canWrite } from "@/lib/data";
import { apiFetch } from "@/lib/api";
import { prisma } from "@fl/db";

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
  const fields = await prisma.landParcel.findMany({ where: { farmId }, select: { id: true, name: true }, orderBy: { name: "asc" } });

  return <TransactionsClient farmId={farmId} initial={initial} accounts={accounts} fields={fields} canWrite={writable} />;
}
