import type { FastifyInstance } from "fastify";
import { prisma } from "@fl/db";
import { transactionInput, deserializeCents } from "@fl/core";

/** Invariant 2: refuse writes that fall in a locked accounting period. */
async function assertPeriodOpen(farmId: string, date: Date) {
  const period = await prisma.accountingPeriod.findUnique({
    where: { farmId_year: { farmId, year: date.getFullYear() } },
  });
  if (period?.locked) {
    const err: Error & { statusCode?: number } = new Error(`Accounting period ${date.getFullYear()} is locked`);
    err.statusCode = 409;
    throw err;
  }
}

/** Invariant 2: every financial mutation is recorded who/what/when/before/after. */
function audit(farmId: string, action: string, entityId: string, before: unknown, after: unknown) {
  return prisma.auditLog.create({
    data: {
      farmId, action, entity: "Transaction", entityId,
      before: (before as object) ?? undefined,
      after: (after as object) ?? undefined,
    },
  });
}

// Serialize a transaction's BigInt before stashing it in the JSON audit trail.
const snap = (t: { amountCents: bigint } & Record<string, unknown>) => ({ ...t, amountCents: t.amountCents.toString() });

export async function registerTransactions(app: FastifyInstance) {
  app.get("/farms/:farmId/transactions", async (req) => {
    const { farmId } = req.params as { farmId: string };
    return prisma.transaction.findMany({
      where: { farmId },
      orderBy: { date: "desc" },
      include: { account: true, relatedInventory: true },
    });
  });

  app.post("/farms/:farmId/transactions", async (req, reply) => {
    const { farmId } = req.params as { farmId: string };
    const parsed = transactionInput.safeParse({ ...(req.body as object), farmId });
    if (!parsed.success) return reply.badRequest(parsed.error.message);

    const account = await prisma.account.findUnique({
      where: { farmId_code: { farmId, code: parsed.data.accountCode } },
    });
    if (!account) return reply.badRequest(`Unknown account code: ${parsed.data.accountCode}`);
    await assertPeriodOpen(farmId, parsed.data.date);

    const tx = await prisma.transaction.create({
      data: {
        farmId,
        date: parsed.data.date,
        description: parsed.data.description,
        accountId: account.id,
        amountCents: deserializeCents(parsed.data.amountCents),
        vendor: parsed.data.vendor,
        relatedInventoryId: parsed.data.relatedInventoryId,
        relatedLabel: (req.body as { relatedLabel?: string }).relatedLabel,
      },
    });
    await audit(farmId, "create", tx.id, null, snap(tx));
    return reply.code(201).send(tx);
  });

  app.delete("/farms/:farmId/transactions/:id", async (req, reply) => {
    const { farmId, id } = req.params as { farmId: string; id: string };
    const existing = await prisma.transaction.findFirst({ where: { id, farmId } });
    if (!existing) return reply.notFound("Transaction not found");
    await assertPeriodOpen(farmId, existing.date);

    await prisma.transaction.delete({ where: { id } });
    await audit(farmId, "delete", id, snap(existing), null);
    return reply.code(204).send();
  });
}
