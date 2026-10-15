import type { PrismaClient } from "@prisma/client";
import type { BalanceSheetInputs, StatementRow } from "@fl/core";

/** Load everything the statement engine needs for one farm. */
export async function loadStatementInputs(prisma: PrismaClient, farmId: string): Promise<BalanceSheetInputs & { cutoff: Date | null }> {
  const [farm, txns, inventory, assets, loans, opening] = await Promise.all([
    prisma.farm.findUniqueOrThrow({ where: { id: farmId }, select: { reportCutoff: true } }),
    prisma.transaction.findMany({
      where: { farmId },
      select: { date: true, cashDate: true, amountCents: true, cashEffectCents: true, paymentMethod: true, enterpriseId: true, account: { select: { code: true, label: true, section: true, cashFlowClass: true, statementLine: true } } },
    }),
    prisma.inventorySnapshot.findMany({ where: { farmId }, select: { asOf: true, category: true, bsValuation: true, costBasisCents: true, marketValueCents: true } }),
    prisma.asset.findMany({ where: { farmId }, select: { category: true, purchasedAt: true, originalCostCents: true, salvageCents: true, usefulLifeYears: true, disposedAt: true, estCurrentValueCents: true } }),
    prisma.liability.findMany({ where: { farmId }, include: { schedule: { orderBy: { number: "asc" } } } }),
    prisma.openingBalance.findMany({ where: { farmId } }),
  ]);
  const ob = (line: string) => opening.find((o) => o.line === line);
  const rows: StatementRow[] = txns.map((x) => ({
    date: x.date, cashDate: x.cashDate, amountCents: x.amountCents, cashEffectCents: x.cashEffectCents,
    section: x.account.section, accountCode: x.account.code, paymentMethod: x.paymentMethod, enterpriseId: x.enterpriseId, cashFlowClass: x.account.cashFlowClass ?? defaultCashClass(x.account.section), statementLine: x.account.statementLine ?? x.account.label,
  }));
  // Farms without imported opening balances start their books at the first transaction.
  const firstDate = txns.reduce<Date | null>((min, x) => (!min || x.date < min ? x.date : min), null);
  const asOf = ob("cash")?.asOf ?? (firstDate ? new Date(firstDate.getTime() - 86_400_000) : new Date(0));
  return {
    cutoff: farm.reportCutoff,
    rows,
    inventory,
    assets,
    loans: loans.map((l) => ({
      id: l.id, debtType: l.debtType ?? (l.type === "MORTGAGE" ? "Land loan" : l.type === "EQUIPMENT_LOAN" ? "Equipment loan" : null),
      isLine: l.type === "OPERATING_LINE", originatedAt: l.originatedAt, originalCents: l.originalCents,
      schedule: l.schedule.map((s) => ({ dueDate: s.dueDate, principalCents: s.principalCents, endingBalanceCents: s.endingBalanceCents })),
    })),
    opening: {
      asOf,
      cashCents: ob("cash")?.amountCents ?? 0n,
      contributedCents: ob("contributed_capital")?.amountCents ?? 0n,
      retainedCents: ob("retained_earnings")?.amountCents ?? 0n,
      operatingLineCents: ob("operating_line")?.amountCents ?? 0n,
    },
  };
}

/** Cash-flow class for charts of accounts that don't carry one (Schedule F starter chart). */
function defaultCashClass(section: string) {
  return section === "REV" ? "Customer collections" : section === "INT" ? "Debt payments - interest" : "Other operating payments";
}
