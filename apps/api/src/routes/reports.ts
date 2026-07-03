import type { FastifyInstance } from "fastify";
import { prisma } from "@fl/db";
import { profitAndLoss, scheduleFSummary, cashFlowStatement, enterpriseProfitability, centsToDecimal, toCsv, scheduleFToTxf, type ReportTxn } from "@fl/core";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

async function loadReportTxns(farmId: string): Promise<ReportTxn[]> {
  const txns = await prisma.transaction.findMany({ where: { farmId }, include: { account: true } });
  return txns.map((t) => ({ amountCents: t.amountCents, date: t.date, account: { code: t.account.code, label: t.account.label, kind: t.account.kind, scheduleFCode: t.account.scheduleFCode } }));
}

function sendCsv(reply: import("fastify").FastifyReply, filename: string, csv: string) {
  reply.header("content-type", "text/csv; charset=utf-8");
  reply.header("content-disposition", `attachment; filename="${filename}"`);
  // Send a Buffer so the global JSON reply serializer doesn't quote the CSV.
  return reply.send(Buffer.from(csv, "utf-8"));
}

export async function registerReports(app: FastifyInstance) {
  // All four reports for a year as JSON.
  app.get("/farms/:farmId/reports", async (req) => {
    const { farmId } = req.params as { farmId: string };
    const year = Number((req.query as { year?: string }).year ?? new Date().getUTCFullYear());
    const txns = await loadReportTxns(farmId);
    const period = await prisma.accountingPeriod.findUnique({ where: { farmId_year: { farmId, year } } });
    return {
      year,
      locked: period?.locked ?? false,
      pnl: profitAndLoss(txns, year),
      scheduleF: scheduleFSummary(txns, year),
      cashFlow: cashFlowStatement(txns, year),
      enterprises: enterpriseProfitability(txns, year),
    };
  });

  // CSV export per report type.
  app.get("/farms/:farmId/reports/:type/export", async (req, reply) => {
    const { farmId, type } = req.params as { farmId: string; type: string };
    const year = Number((req.query as { year?: string }).year ?? new Date().getUTCFullYear());
    const txns = await loadReportTxns(farmId);
    let rows: (string | number)[][] = [];
    let name = "report";

    if (type === "pnl") {
      const r = profitAndLoss(txns, year);
      name = `profit-and-loss-${year}`;
      rows = [["Profit & Loss", String(year)], [], ["Income", "Sch F", "Amount"]];
      for (const l of r.income) rows.push([l.label, l.scheduleFLine ?? "", centsToDecimal(l.totalCents)]);
      rows.push(["Total Income", "", centsToDecimal(r.totalIncomeCents)], [], ["Expenses", "Sch F", "Amount"]);
      for (const l of r.expenses) rows.push([l.label, l.scheduleFLine ?? "", centsToDecimal(l.totalCents)]);
      rows.push(["Total Expenses", "", centsToDecimal(r.totalExpenseCents)], [], ["Net Profit", "", centsToDecimal(r.netCents)]);
    } else if (type === "schedule-f") {
      const r = scheduleFSummary(txns, year);
      name = `schedule-f-${year}`;
      rows = [["Schedule F Summary", String(year)], [], ["Part I — Income", "Line", "Amount"]];
      for (const l of r.income) rows.push([l.label, l.line, centsToDecimal(l.totalCents)]);
      rows.push(["Gross Income", "", centsToDecimal(r.totalIncomeCents)], [], ["Part II — Expenses", "Line", "Amount"]);
      for (const l of r.expenses) rows.push([l.label, l.line, centsToDecimal(l.totalCents)]);
      rows.push(["Total Expenses", "", centsToDecimal(r.totalExpenseCents)], [], ["Net Farm Profit", "", centsToDecimal(r.netFarmProfitCents)]);
    } else if (type === "cash-flow") {
      const r = cashFlowStatement(txns, year);
      name = `cash-flow-${year}`;
      rows = [["Cash Flow Statement", String(year)], [], ["Month", "Inflow", "Outflow", "Net"]];
      for (const m of r.months) rows.push([MONTHS[m.month - 1]!, centsToDecimal(m.inflowCents), centsToDecimal(m.outflowCents), centsToDecimal(m.netCents)]);
      rows.push(["Total", centsToDecimal(r.inflowCents), centsToDecimal(r.outflowCents), centsToDecimal(r.netCents)]);
    } else if (type === "enterprises") {
      const r = enterpriseProfitability(txns, year);
      name = `enterprise-profitability-${year}`;
      rows = [["Enterprise Profitability", String(year)], [], ["Enterprise", "Income", "Expense", "Net"]];
      for (const e of r) rows.push([e.name, centsToDecimal(e.incomeCents), centsToDecimal(e.expenseCents), centsToDecimal(e.netCents)]);
    } else {
      return reply.badRequest("Unknown report type");
    }
    return sendCsv(reply, `${name}.csv`, toCsv(rows));
  });

  // Schedule F as a TXF file — imports into TurboTax / H&R Block desktop.
  app.get("/farms/:farmId/reports/schedule-f/txf", async (req, reply) => {
    const { farmId } = req.params as { farmId: string };
    const year = Number((req.query as { year?: string }).year ?? new Date().getUTCFullYear());
    const txns = await loadReportTxns(farmId);
    const { txf } = scheduleFToTxf(txns, year);
    reply.header("content-type", "text/plain; charset=utf-8");
    reply.header("content-disposition", `attachment; filename="schedule-f-${year}.txf"`);
    return reply.send(Buffer.from(txf, "utf-8"));
  });

  // --- User-owned data backup (Invariant 7) ---
  app.get("/farms/:farmId/export.json", async (req, reply) => {
    const { farmId } = req.params as { farmId: string };
    const [farm, accounts, transactions, inventory, liabilities, leases, invoices, customers, budgets, goals, plans] = await Promise.all([
      prisma.farm.findUnique({ where: { id: farmId } }),
      prisma.account.findMany({ where: { farmId } }),
      prisma.transaction.findMany({ where: { farmId }, include: { account: true } }),
      prisma.inventoryItem.findMany({ where: { farmId } }),
      prisma.liability.findMany({ where: { farmId } }),
      prisma.lease.findMany({ where: { farmId } }),
      prisma.invoice.findMany({ where: { farmId }, include: { customer: true } }),
      prisma.customer.findMany({ where: { farmId } }),
      prisma.budget.findMany({ where: { farmId } }),
      prisma.financialGoal.findMany({ where: { farmId } }),
      prisma.productionPlan.findMany({ where: { farmId } }),
    ]);
    reply.header("content-disposition", `attachment; filename="field-and-ledger-backup.json"`);
    return { farm, accounts, transactions, inventory, liabilities, leases, invoices, customers, budgets, goals, plans };
  });

  app.get("/farms/:farmId/export/transactions.csv", async (req, reply) => {
    const { farmId } = req.params as { farmId: string };
    const txns = await prisma.transaction.findMany({ where: { farmId }, orderBy: { date: "desc" }, include: { account: true } });
    const rows: (string | number)[][] = [["Date", "Description", "Category", "Schedule F", "Amount"]];
    for (const t of txns) rows.push([t.date.toISOString().slice(0, 10), t.description, t.account.label, t.account.scheduleFCode, centsToDecimal(t.amountCents)]);
    return sendCsv(reply, "transactions.csv", toCsv(rows));
  });
}
