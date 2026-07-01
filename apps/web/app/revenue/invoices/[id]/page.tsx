import { notFound } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { PrintButton } from "@/components/print-button";
import { prisma } from "@fl/db";
import { fmtDate } from "@/lib/format";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  PAID: "bg-mint text-positive", SENT: "bg-[#E7EEF4] text-[#3B6087]", OVERDUE: "bg-[#F3E3E0] text-negative", DRAFT: "bg-tag text-muted", VOID: "bg-tag text-muted",
};

export default async function InvoicePrintPage({ params }: { params: { id: string } }) {
  const inv = await prisma.invoice.findUnique({ where: { id: params.id }, include: { customer: true, farm: true, lineItems: true } });
  if (!inv) notFound();
  const overdue = inv.status === "SENT" && inv.dueAt < new Date();
  const display = overdue ? "OVERDUE" : inv.status;
  const lines = inv.lineItems.length ? inv.lineItems.map((l) => ({ description: l.description, amountCents: l.amountCents })) : [{ description: "Farm products & services", amountCents: inv.totalCents }];

  return (
    <div className="mx-auto max-w-2xl">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href="/revenue" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft size={15} /> Back to Revenue</Link>
        <PrintButton />
      </div>

      <Card className="p-10">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-serif text-3xl font-bold text-primary">Field &amp; Ledger</h1>
            <p className="text-sm text-muted">{inv.farm.name}</p>
          </div>
          <div className="text-right">
            <p className="font-serif text-2xl font-semibold text-ink">Invoice</p>
            <p className="text-sm text-muted">#{inv.number}</p>
            <span className={`mt-2 inline-block rounded-pill px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[display]}`}>{display.toLowerCase()}</span>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted">Bill to</p>
            <p className="mt-1 font-medium text-ink">{inv.customer.name}</p>
            {inv.customer.email && <p className="text-muted">{inv.customer.email}</p>}
          </div>
          <div className="text-right">
            <p className="text-muted">Issued: <span className="text-ink">{fmtDate(inv.issuedAt)}</span></p>
            <p className="text-muted">Due: <span className="text-ink">{fmtDate(inv.dueAt)}</span></p>
            {inv.paidAt && <p className="text-positive">Paid: {fmtDate(inv.paidAt)}</p>}
          </div>
        </div>

        <table className="mt-8 w-full text-sm">
          <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted"><th className="py-2">Description</th><th className="py-2 text-right">Amount</th></tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-b border-border"><td className="py-3 text-ink">{l.description}</td><td className="py-3 text-right text-ink"><Money cents={l.amountCents} /></td></tr>
            ))}
          </tbody>
        </table>

        <div className="mt-6 flex justify-end">
          <div className="w-56">
            <div className="flex items-center justify-between border-t-2 border-primary pt-3">
              <span className="font-serif text-lg font-semibold text-ink">Total</span>
              <span className="font-serif text-2xl font-bold text-ink"><Money cents={inv.totalCents} /></span>
            </div>
          </div>
        </div>

        <p className="mt-10 text-center text-xs text-muted">Thank you for your business — Field &amp; Ledger</p>
      </Card>
    </div>
  );
}
