import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { TableImport } from "@/components/table-import";
import { getDemoFarmId, getCurrentRole, canWrite } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ImportPage({ searchParams }: { searchParams: { table?: string } }) {
  const farmId = await getDemoFarmId();
  return (
    <>
      <PageHeader title="Import" action={<Link href="/transactions" className="rounded-btn border border-border px-4 py-2.5 text-sm text-ink hover:bg-tag/40">Bank Transactions</Link>} />
      <TableImport farmId={farmId} initialTable={searchParams.table ?? "customers"} canWrite={canWrite(await getCurrentRole())} />
    </>
  );
}
