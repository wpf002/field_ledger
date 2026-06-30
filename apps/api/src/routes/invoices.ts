import type { FastifyInstance } from "fastify";
import { prisma } from "@fl/db";

async function assertPeriodOpen(farmId: string, date: Date) {
  const period = await prisma.accountingPeriod.findUnique({ where: { farmId_year: { farmId, year: date.getUTCFullYear() } } });
  if (period?.locked) { const e: Error & { statusCode?: number } = new Error(`Accounting period ${date.getUTCFullYear()} is locked`); e.statusCode = 409; throw e; }
}

export async function registerInvoices(app: FastifyInstance) {
  app.get("/farms/:farmId/invoices/:id", async (req, reply) => {
    const { farmId, id } = req.params as { farmId: string; id: string };
    const invoice = await prisma.invoice.findFirst({ where: { id, farmId }, include: { customer: true, lineItems: true, payments: true, farm: true } });
    if (!invoice) return reply.notFound("Invoice not found");
    return invoice;
  });

  // Mark an invoice sent (Phase 7 can wire actual email; flagged for now).
  app.post("/farms/:farmId/invoices/:id/send", async (req, reply) => {
    const { farmId, id } = req.params as { farmId: string; id: string };
    const inv = await prisma.invoice.findFirst({ where: { id, farmId } });
    if (!inv) return reply.notFound("Invoice not found");
    if (inv.status === "PAID") return reply.badRequest("Invoice is already paid");
    const updated = await prisma.invoice.update({ where: { id }, data: { status: "SENT" } });
    await prisma.auditLog.create({ data: { farmId, action: "update", entity: "Invoice", entityId: id, before: { status: inv.status }, after: { status: "SENT" } } });
    return updated;
  });

  // Capture payment: mark PAID + post the income to the ledger (cash basis) as
  // the payment record, linked back to the invoice. Audited (Invariant 2).
  app.post("/farms/:farmId/invoices/:id/pay", async (req, reply) => {
    const { farmId, id } = req.params as { farmId: string; id: string };
    const inv = await prisma.invoice.findFirst({ where: { id, farmId } });
    if (!inv) return reply.notFound("Invoice not found");
    if (inv.status === "PAID") return reply.badRequest("Invoice is already paid");

    const paidAt = new Date();
    await assertPeriodOpen(farmId, paidAt);
    const account = await prisma.account.findUnique({ where: { farmId_code: { farmId, code: "other_income" } } });
    if (!account) return reply.badRequest("Missing account other_income");

    const tx = await prisma.transaction.create({
      data: { farmId, date: paidAt, accountId: account.id, description: `Invoice payment — #${inv.number}`, amountCents: inv.totalCents, source: "invoice_payment", invoiceId: inv.id },
    });
    const updated = await prisma.invoice.update({ where: { id }, data: { status: "PAID", paidAt } });
    await prisma.auditLog.create({ data: { farmId, action: "post", entity: "Transaction", entityId: tx.id, after: { invoiceId: inv.id, amountCents: inv.totalCents.toString() } } });
    await prisma.auditLog.create({ data: { farmId, action: "update", entity: "Invoice", entityId: id, before: { status: inv.status }, after: { status: "PAID" } } });

    return reply.code(201).send({ invoice: updated, payment: tx });
  });
}
