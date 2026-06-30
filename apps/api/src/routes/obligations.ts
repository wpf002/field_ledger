import type { FastifyInstance } from "fastify";
import { prisma } from "@fl/db";
import { z } from "zod";
import { amortizationSchedule, nextPaymentSplit, obligationsInWindow, addPeriod, type Freq, type LiabilityLike, type LeaseLike } from "@fl/core";

const asFreq = (s: string): Freq => (["monthly", "quarterly", "semiannual", "annual"].includes(s) ? (s as Freq) : "monthly");

async function assertPeriodOpen(farmId: string, date: Date) {
  const period = await prisma.accountingPeriod.findUnique({ where: { farmId_year: { farmId, year: date.getUTCFullYear() } } });
  if (period?.locked) { const e: Error & { statusCode?: number } = new Error(`Accounting period ${date.getUTCFullYear()} is locked`); e.statusCode = 409; throw e; }
}

export async function registerObligations(app: FastifyInstance) {
  // Forward-looking obligations within a window — drives Insights.
  app.get("/farms/:farmId/obligations", async (req) => {
    const { farmId } = req.params as { farmId: string };
    const days = Number((req.query as { days?: string }).days ?? 90);
    const [liabilities, leases] = await Promise.all([
      prisma.liability.findMany({ where: { farmId } }),
      prisma.lease.findMany({ where: { farmId } }),
    ]);
    const li: LiabilityLike[] = liabilities.map((l) => ({ id: l.id, name: l.name, balanceCents: l.balanceCents, ratePct: Number(l.ratePct), paymentCents: l.paymentCents, nextPaymentAt: l.nextPaymentAt, paymentFreq: l.paymentFreq }));
    const le: LeaseLike[] = leases.map((l) => ({ id: l.id, name: l.name, type: l.type, annualRentCents: l.annualRentCents, termStart: l.termStart, termEnd: l.termEnd }));
    return obligationsInWindow(li, le, new Date(), days);
  });

  // Amortization schedule for one loan.
  app.get("/farms/:farmId/liabilities/:id/schedule", async (req, reply) => {
    const { farmId, id } = req.params as { farmId: string; id: string };
    const l = await prisma.liability.findFirst({ where: { id, farmId } });
    if (!l) return reply.notFound("Liability not found");
    if (!l.nextPaymentAt || l.paymentCents == null) return { rows: [] };
    const rows = amortizationSchedule({ balanceCents: l.balanceCents, annualRatePct: Number(l.ratePct), paymentCents: l.paymentCents, firstDueDate: l.nextPaymentAt, freq: asFreq(l.paymentFreq) }, 360);
    return { rows };
  });

  // Auto-post the next scheduled loan payment: interest -> ledger expense,
  // principal -> balance reduction. Audited (Invariant 2).
  app.post("/farms/:farmId/liabilities/:id/post-payment", async (req, reply) => {
    const { farmId, id } = req.params as { farmId: string; id: string };
    const l = await prisma.liability.findFirst({ where: { id, farmId } });
    if (!l) return reply.notFound("Liability not found");
    if (!l.nextPaymentAt || l.paymentCents == null) return reply.badRequest("Liability has no scheduled payment");

    const split = nextPaymentSplit({ balanceCents: l.balanceCents, ratePct: Number(l.ratePct), paymentCents: l.paymentCents, nextPaymentAt: l.nextPaymentAt, paymentFreq: l.paymentFreq });
    if (!split) return reply.badRequest("Could not compute payment");
    await assertPeriodOpen(farmId, l.nextPaymentAt);

    const code = l.type === "MORTGAGE" ? "interest_mortgage" : "interest_other";
    const account = await prisma.account.findUnique({ where: { farmId_code: { farmId, code } } });
    if (!account) return reply.badRequest(`Missing account ${code}`);

    // Interest is the deductible Schedule F expense; principal reduces the balance.
    const tx = await prisma.transaction.create({
      data: {
        farmId, date: l.nextPaymentAt, accountId: account.id,
        description: `Loan payment — ${l.name} (interest)`,
        amountCents: -split.interestCents, source: "auto_post", liabilityId: l.id,
      },
    });
    const updated = await prisma.liability.update({
      where: { id }, data: { balanceCents: l.balanceCents - split.principalCents, nextPaymentAt: addPeriod(l.nextPaymentAt, asFreq(l.paymentFreq)) },
    });
    await prisma.auditLog.create({ data: { farmId, action: "post", entity: "Transaction", entityId: tx.id, after: { interestCents: split.interestCents.toString(), liabilityId: l.id } } });
    await prisma.auditLog.create({ data: { farmId, action: "update", entity: "Liability", entityId: l.id, before: { balanceCents: l.balanceCents.toString() }, after: { balanceCents: updated.balanceCents.toString(), principalCents: split.principalCents.toString() } } });

    return reply.code(201).send({ transaction: tx, liability: updated, split });
  });

  // Post a cash-rent lease payment (full rent for the period) to the ledger.
  app.post("/farms/:farmId/leases/:id/post-payment", async (req, reply) => {
    const { farmId, id } = req.params as { farmId: string; id: string };
    const l = await prisma.lease.findFirst({ where: { id, farmId } });
    if (!l) return reply.notFound("Lease not found");
    if (l.type !== "CASH_RENT" || l.annualRentCents == null || !l.nextPaymentAt) return reply.badRequest("Lease has no scheduled cash payment");
    await assertPeriodOpen(farmId, l.nextPaymentAt);

    const account = await prisma.account.findUnique({ where: { farmId_code: { farmId, code: "rent_lease_land" } } });
    if (!account) return reply.badRequest("Missing account rent_lease_land");

    const tx = await prisma.transaction.create({
      data: { farmId, date: l.nextPaymentAt, accountId: account.id, description: `Lease payment — ${l.name}`, amountCents: -l.annualRentCents, source: "auto_post", leaseId: l.id },
    });
    const updated = await prisma.lease.update({ where: { id }, data: { nextPaymentAt: addPeriod(l.nextPaymentAt, asFreq(l.paymentFreq)) } });
    await prisma.auditLog.create({ data: { farmId, action: "post", entity: "Transaction", entityId: tx.id, after: { leaseId: l.id, amountCents: l.annualRentCents.toString() } } });
    return reply.code(201).send({ transaction: tx, lease: updated });
  });
}
