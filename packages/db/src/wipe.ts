import type { PrismaClient } from "@prisma/client";

/** Delete a farm and every farm-scoped row, in foreign-key-safe order. */
export async function wipeFarm(prisma: PrismaClient, farmId: string) {
  const where = { farmId };
  await prisma.transaction.deleteMany({ where });
  await prisma.importBatch.deleteMany({ where });
  await prisma.invoiceLineItem.deleteMany({ where: { invoice: { farmId } } });
  await prisma.invoice.deleteMany({ where });
  await prisma.bill.deleteMany({ where });
  await prisma.customer.deleteMany({ where });
  await prisma.vendor.deleteMany({ where });
  await prisma.inventoryItem.deleteMany({ where });
  await prisma.inventorySnapshot.deleteMany({ where });
  await prisma.asset.deleteMany({ where }); // AssetDepreciation cascades
  await prisma.liability.deleteMany({ where }); // LoanScheduleEntry cascades
  await prisma.lease.deleteMany({ where });
  await prisma.budget.deleteMany({ where });
  await prisma.budgetMonth.deleteMany({ where });
  await prisma.enterpriseBudget.deleteMany({ where });
  await prisma.financialGoal.deleteMany({ where });
  await prisma.productionPlan.deleteMany({ where });
  await prisma.productionRecord.deleteMany({ where });
  await prisma.cropSeason.deleteMany({ where });
  await prisma.landParcel.deleteMany({ where });
  await prisma.animal.deleteMany({ where });
  await prisma.semenEvent.deleteMany({ where });
  await prisma.bullValuation.deleteMany({ where });
  await prisma.reproductionYear.deleteMany({ where });
  await prisma.processedAnimal.deleteMany({ where });
  await prisma.laborEntry.deleteMany({ where });
  await prisma.weatherMonth.deleteMany({ where });
  await prisma.openingBalance.deleteMany({ where });
  await prisma.enterpriseTransfer.deleteMany({ where });
  await prisma.forecastAssumption.deleteMany({ where });
  await prisma.scenarioLever.deleteMany({ where });
  await prisma.insightReference.deleteMany({ where });
  await prisma.herdFlowMonth.deleteMany({ where });
  await prisma.landValuation.deleteMany({ where });
  await prisma.enterpriseUnitCount.deleteMany({ where });
  await prisma.forecastSetting.deleteMany({ where });
  await prisma.forecastRun.deleteMany({ where });
  await prisma.connection.deleteMany({ where }); // SyncRun cascades
  await prisma.enterprise.deleteMany({ where: { farmId, parentId: { not: null } } });
  await prisma.enterprise.deleteMany({ where });
  await prisma.alert.deleteMany({ where });
  await prisma.auditLog.deleteMany({ where });
  await prisma.alertSetting.deleteMany({ where });
  await prisma.alertDismissal.deleteMany({ where });
  await prisma.accountingPeriod.deleteMany({ where });
  await prisma.account.deleteMany({ where });
  await prisma.membership.deleteMany({ where });
  await prisma.farm.delete({ where: { id: farmId } });
}
