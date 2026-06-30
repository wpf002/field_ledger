import type { FastifyInstance } from "fastify";
import { prisma } from "@fl/db";
import { z } from "zod";
import { toCents, normalizeDate } from "@fl/core";

const DAY = 86_400_000;
const daysApart = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) / DAY;

const stmtRow = z.object({ date: z.string(), description: z.string(), amount: z.string() });

export async function registerReconcile(app: FastifyInstance) {
  // Match imported statement lines against unreconciled ledger transactions.
  app.post("/farms/:farmId/reconcile/match", async (req, reply) => {
    const { farmId } = req.params as { farmId: string };
    const parsed = z.object({ rows: z.array(stmtRow), windowDays: z.number().optional() }).safeParse(req.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const window = parsed.data.windowDays ?? 5;

    const ledger = await prisma.transaction.findMany({
      where: { farmId, reconciled: false },
      orderBy: { date: "desc" },
      include: { account: true },
    });

    const used = new Set<string>();
    const matches: { statement: { date: string; description: string; amountCents: string }; transaction: typeof ledger[number] }[] = [];
    const unmatchedStatement: { date: string; description: string; amountCents: string; error?: string }[] = [];

    for (const r of parsed.data.rows) {
      let line: { date: string; description: string; amountCents: string };
      let amountCents: bigint;
      try {
        amountCents = toCents(r.amount);
        line = { date: normalizeDate(r.date), description: r.description.trim(), amountCents: amountCents.toString() };
      } catch (e) {
        unmatchedStatement.push({ date: r.date, description: r.description, amountCents: "0", error: e instanceof Error ? e.message : "bad row" });
        continue;
      }
      // Same amount, closest date inside the window, not already taken.
      const stmtDate = new Date(line.date);
      const candidate = ledger
        .filter((t) => !used.has(t.id) && t.amountCents === amountCents && daysApart(t.date, stmtDate) <= window)
        .sort((a, b) => daysApart(a.date, stmtDate) - daysApart(b.date, stmtDate))[0];
      if (candidate) { used.add(candidate.id); matches.push({ statement: line, transaction: candidate }); }
      else unmatchedStatement.push(line);
    }

    const unmatchedLedger = ledger.filter((t) => !used.has(t.id));
    return { matches, unmatchedStatement, unmatchedLedger };
  });

  // Mark the chosen transactions reconciled (Invariant 2: audited).
  app.post("/farms/:farmId/reconcile/commit", async (req, reply) => {
    const { farmId } = req.params as { farmId: string };
    const parsed = z.object({ transactionIds: z.array(z.string().uuid()) }).safeParse(req.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);

    const now = new Date();
    let count = 0;
    for (const id of parsed.data.transactionIds) {
      const tx = await prisma.transaction.findFirst({ where: { id, farmId } });
      if (!tx || tx.reconciled) continue;
      await prisma.transaction.update({ where: { id }, data: { reconciled: true, reconciledAt: now } });
      await prisma.auditLog.create({ data: { farmId, action: "reconcile", entity: "Transaction", entityId: id, before: { reconciled: false }, after: { reconciled: true } } });
      count++;
    }
    return { reconciled: count };
  });
}
