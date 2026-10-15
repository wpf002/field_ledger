import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { RevenueTabs } from "@/components/revenue-tabs";
import { InvoiceActions } from "@/components/invoice-actions";
import { EmptyState } from "@/components/ui/empty-state";
import { prisma, pnlWhere } from "@fl/db";
import { getDemoFarmId } from "@/lib/data";
import { sumCents, agingSummary, AGING_BUCKETS } from "@fl/core";
import { getStatementContext } from "@/lib/statements";
import { fmtDate } from "@/lib/format";
import { DollarSign, FileText, TrendingUp, FileWarning, Mail } from "lucide-react";

const STATUS_STYLE: Record<string, string> = {
  PAID: "bg-mint text-positive",
  SENT: "bg-[#E7EEF4] text-[#3B6087]",
  OVERDUE: "bg-[#F3E3E0] text-negative",
  DRAFT: "bg-tag text-muted",
  VOID: "bg-tag text-muted",
};
const d = (date: Date) => fmtDate(date);

export const dynamic = "force-dynamic";

export default async function RevenuePage() {
  const farmId = await getDemoFarmId();
  const [txns, invoices, customers] = await Promise.all([
    prisma.transaction.findMany({ where: { farmId, ...pnlWhere, account: { section: "REV" } } }),
    prisma.invoice.findMany({ where: { farmId }, include: { customer: true }, orderBy: [{ issuedAt: "desc" }, { number: "desc" }] }),
    prisma.customer.findMany({ where: { farmId }, include: { invoices: true }, orderBy: { name: "asc" } }),
  ]);

  const totalRevenue = sumCents(txns.filter((t) => t.amountCents > 0n).map((t) => t.amountCents));
  const invoiced = sumCents(invoices.map((i) => i.totalCents));
  const paid = sumCents(invoices.filter((i) => i.status === "PAID").map((i) => i.totalCents));
  const open = invoices.filter((i) => i.status === "SENT" || i.status === "OVERDUE");
  const outstanding = sumCents(open.map((i) => i.totalCents - i.amountPaidCents));
  const { asOf } = await getStatementContext(farmId);
  const aging = agingSummary(open.map((i) => ({ dueDate: i.dueAt, balanceCents: i.totalCents - i.amountPaidCents })), asOf);
  // Open invoices first, then the most recent paid ones.
  const LIST_LIMIT = 50;
  const listed = [...open, ...invoices.filter((i) => !open.includes(i))].slice(0, LIST_LIMIT);
  const paidCount = invoices.filter((i) => i.status === "PAID").length;

  const invoiceList = invoices.length === 0 ? (
    <EmptyState icon={<FileText size={22} />} title="No invoices yet" hint="Create an invoice to bill a customer and track payments here." />
  ) : (
    <div className="space-y-4">
      {invoices.length > LIST_LIMIT && <p className="text-xs text-muted">Showing {LIST_LIMIT} of {invoices.length}</p>}
      {listed.map((inv) => {
        const overdue = inv.status === "SENT" && inv.dueAt < asOf;
        const display = overdue ? "OVERDUE" : inv.status;
        return (
        <Card key={inv.id} className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <span className="font-serif text-lg font-bold text-ink">#{inv.number}</span>
                <span className={`rounded-pill px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[display]}`}>{display.toLowerCase()}</span>
              </div>
              <p className="mt-1 text-sm text-ink">{inv.customer.name}</p>
              <p className="text-xs text-muted">Issued: {d(inv.issuedAt)} · Due: {d(inv.dueAt)}</p>
            </div>
            <span className="font-serif text-2xl font-bold text-ink"><Money cents={inv.totalCents} /></span>
          </div>
          <InvoiceActions farmId={farmId} id={inv.id} number={inv.number} status={inv.status} />
        </Card>
        );
      })}
    </div>
  );

  const customerListEmpty = customers.length === 0;
  const customerList = customerListEmpty ? (
    <EmptyState icon={<Mail size={22} />} title="No customers yet" hint="Customers appear here as you add invoices for them." />
  ) : (
    <div className="space-y-4">
      {customers.map((c) => (
        <Card key={c.id} className="flex items-center justify-between p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-tag text-brown"><Mail size={16} /></span>
            <div>
              <p className="font-medium text-ink">{c.name}</p>
              <p className="text-xs text-muted">{c.invoices.length} invoice{c.invoices.length === 1 ? "" : "s"}</p>
            </div>
          </div>
          <span className="font-serif text-lg font-bold text-ink"><Money cents={sumCents(c.invoices.map((i) => i.totalCents))} /></span>
        </Card>
      ))}
    </div>
  );

  return (
    <>
      <PageHeader title="Revenue" />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-5">
        <StatCard label="Total Revenue" value={<Money cents={totalRevenue} />} sub="All recorded income" icon={<DollarSign size={18} className="text-muted" />} />
        <StatCard label="Invoiced" value={<Money cents={invoiced} />} sub={`${invoices.length} total invoice${invoices.length === 1 ? "" : "s"}`} icon={<FileText size={18} className="text-muted" />} />
        <StatCard label="Paid" value={<Money cents={paid} />} sub={`${paidCount} paid invoice${paidCount === 1 ? "" : "s"}`} variant="mint" icon={<TrendingUp size={18} className="text-positive" />} />
        <StatCard label="Outstanding" value={<Money cents={outstanding} className="text-rust" />} sub="Awaiting payment" variant="cream" icon={<FileWarning size={18} className="text-rust" />} />
      </div>

      {open.length > 0 && (
        <Card className="mt-5 grid grid-cols-2 gap-4 p-5 sm:grid-cols-5">
          {AGING_BUCKETS.map((b) => (
            <div key={b}>
              <p className="text-xs uppercase tracking-wider text-muted">{b === "Current" ? "Current" : `${b} Days`}</p>
              <p className={`mt-1 text-lg font-bold ${b !== "Current" && aging[b] > 0n ? "text-rust" : "text-ink"}`}><Money cents={aging[b]} /></p>
            </div>
          ))}
        </Card>
      )}

      <RevenueTabs invoices={invoiceList} customers={customerList} />
    </>
  );
}
