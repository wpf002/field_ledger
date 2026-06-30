import type { FastifyInstance } from "fastify";
import { prisma } from "@fl/db";
import { z } from "zod";
import { evaluateAlerts, mergeSettings, sumCents, type AlertInputs } from "@fl/core";

/** Budget vs actual spend per budget row (for the budget_over rule). */
async function budgetActuals(farmId: string): Promise<AlertInputs["budgetActuals"]> {
  const [budgets, txns, accounts] = await Promise.all([
    prisma.budget.findMany({ where: { farmId } }),
    prisma.transaction.findMany({ where: { farmId }, include: { account: true } }),
    prisma.account.findMany({ where: { farmId } }),
  ]);
  const labelByCode = new Map(accounts.map((a) => [a.code, a.label]));
  return budgets.map((b) => {
    const actualCents = sumCents(
      txns.filter((t) => t.account.code === b.accountCode && t.amountCents < 0n &&
        t.date.getUTCFullYear() === b.year && (b.period !== "MONTHLY" || !b.month || t.date.getUTCMonth() + 1 === b.month))
        .map((t) => -t.amountCents),
    );
    return { id: b.id, label: labelByCode.get(b.accountCode) ?? b.accountCode, budgetCents: b.amountCents, actualCents };
  });
}

async function loadSettings(farmId: string) {
  const rows = await prisma.alertSetting.findMany({ where: { farmId } });
  return mergeSettings(rows);
}

export async function registerAlerts(app: FastifyInstance) {
  app.get("/farms/:farmId/alerts", async (req) => {
    const { farmId } = req.params as { farmId: string };
    const [liabilities, leases, invoices, dismissals, settings, actuals] = await Promise.all([
      prisma.liability.findMany({ where: { farmId } }),
      prisma.lease.findMany({ where: { farmId } }),
      prisma.invoice.findMany({ where: { farmId }, include: { customer: true } }),
      prisma.alertDismissal.findMany({ where: { farmId } }),
      loadSettings(farmId),
      budgetActuals(farmId),
    ]);

    const input: AlertInputs = {
      liabilities: liabilities.map((l) => ({ id: l.id, name: l.name, nextPaymentAt: l.nextPaymentAt, paymentCents: l.paymentCents })),
      leases: leases.map((l) => ({ id: l.id, name: l.name, type: l.type, termEnd: l.termEnd, nextPaymentAt: l.nextPaymentAt, annualRentCents: l.annualRentCents })),
      invoices: invoices.map((i) => ({ id: i.id, number: i.number, status: i.status, dueAt: i.dueAt, totalCents: i.totalCents, customerName: i.customer.name })),
      budgetActuals: actuals,
    };

    const dismissed = new Set(dismissals.map((d) => d.key));
    const alerts = evaluateAlerts(input, new Date(), settings).filter((a) => !dismissed.has(a.key));
    const counts = {
      total: alerts.length,
      critical: alerts.filter((a) => a.severity === "CRITICAL").length,
      warning: alerts.filter((a) => a.severity === "WARNING").length,
      info: alerts.filter((a) => a.severity === "INFO").length,
    };
    return { alerts, counts };
  });

  app.post("/farms/:farmId/alerts/dismiss", async (req, reply) => {
    const { farmId } = req.params as { farmId: string };
    const parsed = z.object({ key: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    await prisma.alertDismissal.upsert({
      where: { farmId_key: { farmId, key: parsed.data.key } },
      create: { farmId, key: parsed.data.key }, update: {},
    });
    return reply.code(201).send({ dismissed: parsed.data.key });
  });

  app.get("/farms/:farmId/alert-settings", async (req) => {
    const { farmId } = req.params as { farmId: string };
    return loadSettings(farmId);
  });

  app.put("/farms/:farmId/alert-settings", async (req, reply) => {
    const { farmId } = req.params as { farmId: string };
    const parsed = z.object({ type: z.enum(["payment_due", "invoice_overdue", "lease_expiring", "budget_over"]), enabled: z.boolean(), leadDays: z.number().int().min(0).max(365) }).safeParse(req.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    await prisma.alertSetting.upsert({
      where: { farmId_type: { farmId, type: parsed.data.type } },
      create: { farmId, type: parsed.data.type, enabled: parsed.data.enabled, leadDays: parsed.data.leadDays },
      update: { enabled: parsed.data.enabled, leadDays: parsed.data.leadDays },
    });
    return loadSettings(farmId);
  });
}
