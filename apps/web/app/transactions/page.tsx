import { TransactionsClient, type Txn, type Account } from "@/components/transactions-client";
import { getDemoFarmId } from "@/lib/data";

// Phase 0 reference page: data flows through the live Fastify API end to end.
const API = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const farmId = await getDemoFarmId();
  const [txnsRes, acctsRes] = await Promise.all([
    fetch(`${API}/farms/${farmId}/transactions`, { cache: "no-store" }),
    fetch(`${API}/farms/${farmId}/accounts`, { cache: "no-store" }),
  ]);
  const initial: Txn[] = await txnsRes.json();
  const accounts: Account[] = await acctsRes.json();

  return <TransactionsClient farmId={farmId} initial={initial} accounts={accounts} />;
}
