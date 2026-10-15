import type { PrismaClient } from "@prisma/client";
import { balanceSheetAt, monthEnds, valueInventoryItem, latestPriceCents, type BalanceSheetInputs, type StatementRow, type InventorySnap, type AssetRec } from "@fl/core";

/** Load everything the statement engine needs for one farm. */
async function loadRaw(prisma: PrismaClient, farmId: string): Promise<BalanceSheetInputs & { rows: (StatementRow & { expectedCashDate: Date | null; description: string })[]; loans: (BalanceSheetInputs["loans"][number] & { name: string })[]; cutoff: Date | null; ownerLaborAnnualCents: bigint; hasOpeningBalances: boolean }> {
  const [farm, txns, inventory, assets, loans, opening, landValues] = await Promise.all([
    prisma.farm.findUniqueOrThrow({ where: { id: farmId }, select: { reportCutoff: true, ownerLaborChargeCents: true } }),
    prisma.transaction.findMany({
      where: { farmId },
      select: { date: true, cashDate: true, expectedCashDate: true, description: true, amountCents: true, cashEffectCents: true, paymentMethod: true, enterpriseId: true, cropSeasonId: true, entryType: true, account: { select: { code: true, label: true, section: true, cashFlowClass: true, statementLine: true } } },
    }),
    prisma.inventorySnapshot.findMany({ where: { farmId }, select: { asOf: true, category: true, bsValuation: true, costBasisCents: true, marketValueCents: true } }),
    prisma.asset.findMany({ where: { farmId }, select: { category: true, purchasedAt: true, originalCostCents: true, salvageCents: true, usefulLifeYears: true, disposedAt: true, estCurrentValueCents: true } }),
    prisma.liability.findMany({ where: { farmId }, include: { schedule: { orderBy: { number: "asc" } } } }),
    prisma.openingBalance.findMany({ where: { farmId } }),
    prisma.landValuation.findMany({ where: { farmId }, select: { asOf: true, marketValueCents: true } }),
  ]);
  const ob = (line: string) => opening.find((o) => o.line === line);
  const rows = txns.map((x) => ({
    date: x.date, cashDate: x.cashDate, amountCents: x.amountCents, cashEffectCents: x.cashEffectCents,
    section: x.account.section, accountCode: x.account.code, paymentMethod: x.paymentMethod, enterpriseId: x.enterpriseId, cashFlowClass: x.account.cashFlowClass ?? defaultCashClass(x.account.section), statementLine: x.account.statementLine ?? x.account.label, cropSeasonId: x.cropSeasonId, entryType: x.entryType, expectedCashDate: x.expectedCashDate, description: x.description,
  }));
  // Farms without imported opening balances start their books at the first transaction.
  const firstDate = txns.reduce<Date | null>((min, x) => (!min || x.date < min ? x.date : min), null);
  const asOf = ob("cash")?.asOf ?? (firstDate ? new Date(firstDate.getTime() - 86_400_000) : new Date(0));
  return {
    cutoff: farm.reportCutoff,
    ownerLaborAnnualCents: farm.ownerLaborChargeCents ?? 0n,
    hasOpeningBalances: opening.length > 0,
    rows,
    inventory,
    landValues,
    assets,
    loans: loans.map((l) => ({
      id: l.id, name: l.name, debtType: l.debtType ?? (l.type === "MORTGAGE" ? "Land loan" : l.type === "EQUIPMENT_LOAN" ? "Equipment loan" : null),
      // Loans entered without a schedule are carried at their current balance.
      isLine: l.type === "OPERATING_LINE", originatedAt: l.originatedAt, originalCents: l.schedule.length ? l.originalCents : l.balanceCents,
      schedule: l.schedule.map((s) => ({ dueDate: s.dueDate, principalCents: s.principalCents, endingBalanceCents: s.endingBalanceCents, paymentCents: s.paymentCents })),
    })),
    opening: {
      asOf,
      cashCents: ob("cash")?.amountCents ?? 0n,
      contributedCents: ob("contributed_capital")?.amountCents ?? 0n,
      retainedCents: ob("retained_earnings")?.amountCents ?? 0n,
      operatingLineCents: ob("operating_line")?.amountCents ?? (opening.length ? 0n : loans.filter((l) => l.type === "OPERATING_LINE").reduce((x, l) => x + l.balanceCents, 0n)),
    },
  };
}

/** Cash-flow class for charts of accounts that don't carry one (Schedule F starter chart). */
function defaultCashClass(section: string) {
  return section === "REV" ? "Customer collections" : section === "INT" ? "Debt payments - interest" : "Other operating payments";
}

const LEGACY_CATEGORY: Record<string, string> = { LIVESTOCK: "Livestock - breeding", FEED: "Feed - hay", CROPS: "Crops - grain", SUPPLIES: "Semen inventory" };

/**
 * Statement inputs for one farm. Farms on the starter model keep inventory and
 * equipment as InventoryItems; those are valued (mark-to-market, equipment at book)
 * as of the reporting date and fed to the balance sheet, and without an opening
 * balance sheet equity opens at whatever balances the books on day one.
 */
export async function loadStatementInputs(prisma: PrismaClient, farmId: string) {
  const inputs = await loadRaw(prisma, farmId);
  const now = new Date();
  const asOf = inputs.cutoff ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  if (inputs.inventory.length === 0 && inputs.assets.length === 0) {
    const [items, prices] = await Promise.all([prisma.inventoryItem.findMany({ where: { farmId } }), prisma.commodityPrice.findMany()]);
    const snaps: InventorySnap[] = [];
    const assets: AssetRec[] = [];
    const dates = [inputs.opening.asOf, ...monthEnds(new Date(inputs.opening.asOf.getTime() + 86_400_000), asOf)];
    for (const it of items) {
      const v = valueInventoryItem(it, latestPriceCents(prices, it.marketSymbol), asOf);
      // Held at today's value: these farms don't post depreciation or revaluation entries.
      if (it.category === "EQUIPMENT") assets.push({ category: "Machinery & equipment", purchasedAt: inputs.opening.asOf, originalCostCents: v.valueCents, salvageCents: 0n, usefulLifeYears: null, disposedAt: null });
      else for (const m of dates) snaps.push({ asOf: m, category: LEGACY_CATEGORY[it.category] ?? "Semen inventory", bsValuation: "market", costBasisCents: it.costBasisCents ?? 0n, marketValueCents: v.valueCents });
    }
    inputs.inventory = snaps;
    inputs.assets = assets;
  }
  if (!inputs.hasOpeningBalances) inputs.opening.retainedCents = balanceSheetAt(inputs, inputs.opening.asOf).balanceCheckCents;
  return inputs;
}
