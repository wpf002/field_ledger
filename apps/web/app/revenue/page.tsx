import clsx from "clsx";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { InvoiceActions } from "@/components/invoice-actions";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkTabs } from "@/components/ui/link-tabs";
import { Th, Td } from "@/components/ui/table";
import { UrlToolbar, UrlPagination } from "@/components/ui/list-controls";
import { PAGE_SIZE } from "@/lib/paging";
import { prisma, pnlWhere } from "@fl/db";
import { getDemoFarmId } from "@/lib/data";
import { sumCents, agingSummary, AGING_BUCKETS } from "@fl/core";
import { getStatementContext } from "@/lib/statements";
import { fmtDate } from "@/lib/format";
import { DollarSign, FileText, TrendingUp, FileWarning, Users } from "lucide-react";

const STATUS_STYLE: Record<string, string> = {
  PAID: "bg-mint text-positive",
  SENT: "bg-cream-tint text-ink",
  OVERDUE: "bg-[#F3E3E0] text-negative",
  DRAFT: "bg-tag text-muted",
  VOID: "bg-tag text-muted",
};
const STATUS_LABEL: Record<string, string> = { PAID: "Paid", SENT: "Sent", OVERDUE: "Overdue", DRAFT: "Draft", VOID: "Void" };

export const dynamic = "force-dynamic";

type SP = { tab?: string; q?: string; status?: string; page?: string };

export default async function RevenuePage({ searchParams }: { searchParams: SP }) {
  const farmId = await getDemoFarmId();
  const tab = searchParams.tab === "customers" ? "customers" : "invoices";
  const [txns, invoices, customers] = await Promise.all([
    prisma.transaction.findMany({ where: { farmId, ...pnlWhere, account: { section: "REV" } }, select: { amountCents: true } }),
    prisma.invoice.findMany({ where: { farmId }, include: { customer: true }, orderBy: [{ issuedAt: "desc" }, { number: "desc" }] }),
    prisma.customer.findMany({ where: { farmId }, include: { invoices: { select: { totalCents: true, amountPaidCents: true, status: true } } }, orderBy: { name: "asc" } }),
  ]);
  const { asOf } = await getStatementContext(farmId);

  const totalRevenue = sumCents(txns.filter((t) => t.amountCents > 0n).map((t) => t.amountCents));
  const invoiced = sumCents(invoices.map((i) => i.totalCents));
  const paid = sumCents(invoices.filter((i) => i.status === "PAID").map((i) => i.totalCents));
  const open = invoices.filter((i) => i.status === "SENT" || i.status === "OVERDUE");
  const outstanding = sumCents(open.map((i) => i.totalCents - i.amountPaidCents));
  const aging = agingSummary(open.map((i) => ({ dueDate: i.dueAt, balanceCents: i.totalCents - i.amountPaidCents })), asOf);
  const paidCount = invoices.filter((i) => i.status === "PAID").length;
  const display = (i: (typeof invoices)[number]) => (i.status === "SENT" && i.dueAt < asOf ? "OVERDUE" : i.status);

  const q = (searchParams.q ?? "").trim().toLowerCase();
  const pageOf = (n: number) => Math.min(Math.max(1, Number(searchParams.page) || 1), Math.max(1, Math.ceil(n / PAGE_SIZE)));

  let body: React.ReactNode;
  if (tab === "invoices") {
    // Open invoices first, then the rest by issue date.
    const ordered = [...open, ...invoices.filter((i) => !open.includes(i))];
    const matches = ordered.filter((i) => (!q || i.number.toLowerCase().includes(q) || i.customer.name.toLowerCase().includes(q)) && (!searchParams.status || display(i) === searchParams.status));
    const page = pageOf(matches.length);
    const rows = matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const statuses = [...new Set(invoices.map(display))].map((s) => ({ value: s, label: STATUS_LABEL[s] ?? s }));
    body = invoices.length === 0 ? <EmptyState icon={<FileText size={22} />} title="No Invoices" /> : (
      <Card className="overflow-hidden">
        <UrlToolbar placeholder="Search Invoices" filters={[{ param: "status", label: "All Statuses", options: statuses }]} />
        <div className="overflow-x-auto px-2 sm:px-4">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr><Th>Invoice</Th><Th>Customer</Th><Th>Issued</Th><Th>Due</Th><Th>Status</Th><Th right>Amount</Th><Th right>Actions</Th></tr></thead>
            <tbody>
              {rows.map((inv) => {
                const s = display(inv);
                return (
                  <tr key={inv.id} className="border-t border-border">
                    <Td strong className="whitespace-nowrap">#{inv.number}</Td>
                    <Td>{inv.customer.name}</Td>
                    <Td muted className="whitespace-nowrap">{fmtDate(inv.issuedAt)}</Td>
                    <Td muted className="whitespace-nowrap">{fmtDate(inv.dueAt)}</Td>
                    <Td><span className={clsx("rounded-pill px-2.5 py-0.5 text-xs font-medium", STATUS_STYLE[s])}>{STATUS_LABEL[s] ?? s}</span></Td>
                    <Td right><Money cents={inv.totalCents} /></Td>
                    <Td><InvoiceActions farmId={farmId} id={inv.id} number={inv.number} status={inv.status} /></Td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted">No Matches</td></tr>}
            </tbody>
          </table>
        </div>
        <UrlPagination page={page} pageSize={PAGE_SIZE} total={matches.length} />
      </Card>
    );
  } else {
    const matches = customers.filter((c) => !q || c.name.toLowerCase().includes(q));
    const page = pageOf(matches.length);
    const rows = matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    body = customers.length === 0 ? <EmptyState icon={<Users size={22} />} title="No Customers" /> : (
      <Card className="overflow-hidden">
        <UrlToolbar placeholder="Search Customers" />
        <div className="overflow-x-auto px-2 sm:px-4">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr><Th>Customer</Th><Th right>Invoices</Th><Th right>Open</Th><Th right>Invoiced</Th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <Td>{c.name}</Td>
                  <Td right muted>{c.invoices.length}</Td>
                  <Td right><Money cents={sumCents(c.invoices.filter((i) => i.status !== "PAID" && i.status !== "VOID").map((i) => i.totalCents - i.amountPaidCents))} /></Td>
                  <Td right strong><Money cents={sumCents(c.invoices.map((i) => i.totalCents))} /></Td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-muted">No Matches</td></tr>}
            </tbody>
          </table>
        </div>
        <UrlPagination page={page} pageSize={PAGE_SIZE} total={matches.length} />
      </Card>
    );
  }

  return (
    <>
      <PageHeader title="Revenue" />

      <div className="grid grid-cols-2 gap-5 xl:grid-cols-4">
        <StatCard label="Total Revenue" value={<Money cents={totalRevenue} />} sub="All recorded income" icon={<DollarSign size={18} className="text-muted" />} />
        <StatCard label="Invoiced" value={<Money cents={invoiced} />} sub={`${invoices.length} invoice${invoices.length === 1 ? "" : "s"}`} icon={<FileText size={18} className="text-muted" />} />
        <StatCard label="Paid" value={<Money cents={paid} />} sub={`${paidCount} paid`} variant="mint" icon={<TrendingUp size={18} className="text-positive" />} />
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

      <div className="mt-8 mb-4">
        <LinkTabs value={tab} options={[{ value: "invoices", label: "Invoices", href: "/revenue" }, { value: "customers", label: "Customers", href: "/revenue?tab=customers" }]} />
      </div>
      {body}
    </>
  );
}
