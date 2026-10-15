import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkTabs } from "@/components/ui/link-tabs";
import { prisma } from "@fl/db";
import { getDemoFarmId } from "@/lib/data";
import { getStatementContext } from "@/lib/statements";
import { fmtDate } from "@/lib/format";
import { agingSummary, agingBucket, AGING_BUCKETS, sumCents } from "@fl/core";
import { Receipt } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PayablesPage({ searchParams }: { searchParams: { show?: string } }) {
  const farmId = await getDemoFarmId();
  const { asOf } = await getStatementContext(farmId);
  const showPaid = searchParams.show === "paid";
  const bills = await prisma.bill.findMany({ where: { farmId }, include: { vendor: true, enterprise: true }, orderBy: [{ dueDate: "asc" }] });
  const open = bills.filter((b) => b.status !== "Paid");
  const balance = (b: (typeof bills)[number]) => b.amountCents - b.amountPaidCents;
  const aging = agingSummary(open.map((b) => ({ dueDate: b.dueDate, balanceCents: balance(b) })), asOf);
  const listed = showPaid ? [...bills].filter((b) => b.status === "Paid").reverse().slice(0, 100) : open;
  const daysPast = (d: Date) => Math.max(0, Math.floor((asOf.getTime() - d.getTime()) / 86_400_000));

  return (
    <>
      <PageHeader title="Payables" />
      {bills.length === 0 ? (
        <EmptyState icon={<Receipt size={22} />} title="No Bills" />
      ) : (
        <>
          <Card className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-6">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted">Open</p>
              <p className="mt-1 text-lg font-bold text-ink"><Money cents={sumCents(open.map(balance))} /></p>
              <p className="text-xs text-muted">{open.length} bill{open.length === 1 ? "" : "s"}</p>
            </div>
            {AGING_BUCKETS.map((b) => (
              <div key={b}>
                <p className="text-xs uppercase tracking-wider text-muted">{b === "Current" ? "Current" : `${b} Days`}</p>
                <p className={`mt-1 text-lg font-bold ${b !== "Current" && aging[b] > 0n ? "text-rust" : "text-ink"}`}><Money cents={aging[b]} /></p>
              </div>
            ))}
          </Card>

          <div className="mt-6 mb-4">
            <LinkTabs value={showPaid ? "paid" : "open"} options={[{ value: "open", label: "Open", href: "/payables" }, { value: "paid", label: "Paid", href: "/payables?show=paid" }]} />
          </div>

          <Card className="overflow-x-auto p-2 sm:p-4">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted">
                  <th className="px-3 py-2 font-medium">Vendor</th><th className="px-3 py-2 font-medium">Bill</th><th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium">Enterprise</th><th className="px-3 py-2 font-medium">Due</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium">{showPaid ? "Paid" : "Days Late"}</th><th className="px-3 py-2 text-right font-medium">{showPaid ? "Amount" : "Balance"}</th>
                </tr>
              </thead>
              <tbody>
                {listed.map((b) => (
                  <tr key={b.id} className="border-t border-border">
                    <td className="px-3 py-2.5 text-ink">{b.vendor.name}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-muted" title={b.description ?? undefined}>{b.number}</td>
                    <td className="px-3 py-2.5 text-muted">{b.category ?? "–"}</td>
                    <td className="max-w-[200px] truncate px-3 py-2.5 text-muted" title={b.enterprise?.name}>{b.enterprise?.name ?? "–"}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-muted">{fmtDate(b.dueDate)}</td>
                    <td className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${!showPaid && agingBucket(b.dueDate, asOf) !== "Current" ? "text-rust" : "text-muted"}`}>
                      {showPaid ? (b.paidAt ? fmtDate(b.paidAt) : "–") : daysPast(b.dueDate)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right"><Money cents={showPaid ? b.amountCents : balance(b)} /></td>
                  </tr>
                ))}
                {listed.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted">No Open Bills</td></tr>}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </>
  );
}
