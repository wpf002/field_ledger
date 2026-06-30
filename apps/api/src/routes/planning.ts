import type { FastifyInstance } from "fastify";
import { prisma } from "@fl/db";
import { z } from "zod";
import { budgetStatus, deserializeCents } from "@fl/core";

export async function registerPlanning(app: FastifyInstance) {
  // --- Budgets (with live budget-vs-actual status) ---
  app.get("/farms/:farmId/budgets", async (req) => {
    const { farmId } = req.params as { farmId: string };
    const [budgets, txns, accounts] = await Promise.all([
      prisma.budget.findMany({ where: { farmId } }),
      prisma.transaction.findMany({ where: { farmId }, include: { account: true } }),
      prisma.account.findMany({ where: { farmId } }),
    ]);
    const labelByCode = new Map(accounts.map((a) => [a.code, a.label]));
    const expenses = txns.map((t) => ({ accountCode: t.account.code, amountCents: t.amountCents, date: t.date }));
    const now = new Date();
    return budgets
      .map((b) => ({ raw: b, status: budgetStatus({ id: b.id, period: b.period, year: b.year, month: b.month, accountCode: b.accountCode, amountCents: b.amountCents, label: labelByCode.get(b.accountCode) }, expenses, now) }))
      .sort((a, b) => a.status.label.localeCompare(b.status.label));
  });

  app.post("/farms/:farmId/budgets", async (req, reply) => {
    const { farmId } = req.params as { farmId: string };
    const parsed = z.object({
      period: z.enum(["MONTHLY", "ANNUAL"]), year: z.number().int(),
      month: z.number().int().min(1).max(12).nullable().optional(),
      accountCode: z.string().min(1), amountCents: z.string().regex(/^\d+$/),
    }).safeParse(req.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const month = parsed.data.period === "MONTHLY" ? parsed.data.month ?? null : null;
    const amountCents = deserializeCents(parsed.data.amountCents);

    // month is nullable so we can't use the compound-unique upsert; find-or-create.
    const existing = await prisma.budget.findFirst({ where: { farmId, period: parsed.data.period, year: parsed.data.year, month, accountCode: parsed.data.accountCode } });
    const budget = existing
      ? await prisma.budget.update({ where: { id: existing.id }, data: { amountCents } })
      : await prisma.budget.create({ data: { farmId, period: parsed.data.period, year: parsed.data.year, month, accountCode: parsed.data.accountCode, amountCents } });
    await prisma.auditLog.create({ data: { farmId, action: "update", entity: "Budget", entityId: budget.id, after: { amountCents: budget.amountCents.toString() } } });
    return reply.code(201).send(budget);
  });

  // --- Production plans ---
  app.get("/farms/:farmId/plans", async (req) => {
    const { farmId } = req.params as { farmId: string };
    return prisma.productionPlan.findMany({ where: { farmId }, orderBy: { startAt: "asc" } });
  });

  app.post("/farms/:farmId/plans", async (req, reply) => {
    const { farmId } = req.params as { farmId: string };
    const parsed = z.object({
      title: z.string().min(1),
      kind: z.enum(["planting", "calving", "harvest", "breeding", "other"]),
      startAt: z.coerce.date(),
      endAt: z.coerce.date().nullable().optional(),
      note: z.string().optional(),
    }).safeParse(req.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const plan = await prisma.productionPlan.create({
      data: { farmId, title: parsed.data.title, kind: parsed.data.kind, startAt: parsed.data.startAt, endAt: parsed.data.endAt ?? null, note: parsed.data.note },
    });
    return reply.code(201).send(plan);
  });

  app.delete("/farms/:farmId/plans/:id", async (req, reply) => {
    const { farmId, id } = req.params as { farmId: string; id: string };
    const plan = await prisma.productionPlan.findFirst({ where: { id, farmId } });
    if (!plan) return reply.notFound("Plan not found");
    await prisma.productionPlan.delete({ where: { id } });
    return reply.code(204).send();
  });
}
