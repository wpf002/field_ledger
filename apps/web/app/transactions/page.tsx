import { TransactionsClient, type Txn, type Account } from "@/components/transactions-client";
import { getDemoFarmId, getCurrentRole, canWrite } from "@/lib/data";

// Server-side fetch needs an absolute origin (can't fetch a relative /api).
const API = process.env.API_URL ?? "http://localhost:4000";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const farmId = await getDemoFarmId();
  const [txnsRes, acctsRes] = await Promise.all([
    fetch(`${API}/farms/${farmId}/transactions`, { cache: "no-store" }),
    fetch(`${API}/farms/${farmId}/accounts`, { cache: "no-store" }),
  ]);
  const initial: Txn[] = await txnsRes.json();
  const accounts: Account[] = await acctsRes.json();
  const writable = canWrite(await getCurrentRole());

  return <TransactionsClient farmId={farmId} initial={initial} accounts={accounts} canWrite={writable} />;
}
