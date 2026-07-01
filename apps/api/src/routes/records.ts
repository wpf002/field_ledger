import type { FastifyInstance } from "fastify";
import { prisma } from "@fl/db";
import { liabilityInput, leaseInput, inventoryItemInput, financialGoalInput, deserializeCents } from "@fl/core";
import { audit } from "../lib/audit.js";

const cents = (v?: string) => (v == null ? undefined : deserializeCents(v));

/** Create routes for the record types whose "Add" buttons were placeholders:
 *  liabilities, leases, inventory items, and financial goals. Each validates,
 *  creates, and writes an audit-trail entry (Invariant 2). */
export async function registerRecords(app: FastifyInstance) {
  app.post("/farms/:farmId/liabilities", async (req, reply) => {
    const { farmId } = req.params as { farmId: string };
    const parsed = liabilityInput.safeParse(req.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const d = parsed.data;
    const created = await prisma.liability.create({
      data: {
        farmId, type: d.type, name: d.name, lender: d.lender,
        originalCents: deserializeCents(d.originalCents), balanceCents: deserializeCents(d.balanceCents),
        ratePct: d.ratePct, paymentCents: cents(d.paymentCents), paymentFreq: d.paymentFreq, nextPaymentAt: d.nextPaymentAt,
      },
    });
    await audit(farmId, "Liability", "create", created.id, null, created);
    return reply.code(201).send(created);
  });

  app.post("/farms/:farmId/leases", async (req, reply) => {
    const { farmId } = req.params as { farmId: string };
    const parsed = leaseInput.safeParse(req.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const d = parsed.data;
    const created = await prisma.lease.create({
      data: {
        farmId, type: d.type, name: d.name, lessor: d.lessor, acres: d.acres,
        termStart: d.termStart, termEnd: d.termEnd,
        annualRentCents: d.type === "CROP_SHARE" ? null : cents(d.annualRentCents),
        paymentFreq: d.paymentFreq, nextPaymentAt: d.nextPaymentAt,
      },
    });
    await audit(farmId, "Lease", "create", created.id, null, created);
    return reply.code(201).send(created);
  });

  app.post("/farms/:farmId/inventory", async (req, reply) => {
    const { farmId } = req.params as { farmId: string };
    const parsed = inventoryItemInput.safeParse(req.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const d = parsed.data;
    const created = await prisma.inventoryItem.create({
      data: {
        farmId, category: d.category, name: d.name, quantity: d.quantity, unit: d.unit, location: d.location,
        unitValueCents: cents(d.unitValueCents), costBasisCents: cents(d.costBasisCents),
        usefulLifeYears: d.usefulLifeYears, salvageCents: cents(d.salvageCents), acquiredAt: d.acquiredAt,
      },
    });
    await audit(farmId, "InventoryItem", "create", created.id, null, created);
    return reply.code(201).send(created);
  });

  app.post("/farms/:farmId/goals", async (req, reply) => {
    const { farmId } = req.params as { farmId: string };
    const parsed = financialGoalInput.safeParse(req.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const d = parsed.data;
    const created = await prisma.financialGoal.create({
      data: {
        farmId, name: d.name, kind: d.kind, targetCents: deserializeCents(d.targetCents),
        currentCents: cents(d.currentCents) ?? 0n, dueAt: d.dueAt, note: d.note,
      },
    });
    await audit(farmId, "FinancialGoal", "create", created.id, null, created);
    return reply.code(201).send(created);
  });
}
