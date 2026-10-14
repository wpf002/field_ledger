-- AlterEnum
ALTER TYPE "AccountKind" ADD VALUE 'BALANCE';

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "cashFlowClass" TEXT,
ADD COLUMN     "section" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "statementLine" TEXT;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "customerType" TEXT,
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "paymentTermsDays" INTEGER;

-- AlterTable
ALTER TABLE "Farm" ADD COLUMN     "accountingMethod" TEXT,
ADD COLUMN     "acres" DECIMAL(12,2),
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "ownerName" TEXT,
ADD COLUMN     "profile" JSONB,
ADD COLUMN     "reportCutoff" TIMESTAMP(3),
ADD COLUMN     "structure" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "amountPaidCents" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "enterpriseId" TEXT,
ADD COLUMN     "expectedPaymentAt" TIMESTAMP(3),
ADD COLUMN     "externalId" TEXT;

-- AlterTable
ALTER TABLE "Liability" ADD COLUMN     "collateral" TEXT,
ADD COLUMN     "debtType" TEXT,
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "firstPaymentAt" TIMESTAMP(3),
ADD COLUMN     "limitCents" BIGINT,
ADD COLUMN     "maturityAt" TIMESTAMP(3),
ADD COLUMN     "numberOfPayments" INTEGER,
ADD COLUMN     "originatedAt" TIMESTAMP(3),
ADD COLUMN     "purpose" TEXT,
ADD COLUMN     "rateType" TEXT;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "animalId" TEXT,
ADD COLUMN     "assetId" TEXT,
ADD COLUMN     "billId" TEXT,
ADD COLUMN     "cashDate" TIMESTAMP(3),
ADD COLUMN     "cashEffectCents" BIGINT,
ADD COLUMN     "cropSeasonId" TEXT,
ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "enterpriseId" TEXT,
ADD COLUMN     "entryType" TEXT NOT NULL DEFAULT 'ledger',
ADD COLUMN     "expectedCashDate" TIMESTAMP(3),
ADD COLUMN     "paymentMethod" TEXT,
ADD COLUMN     "quantity" DECIMAL(16,4),
ADD COLUMN     "unit" TEXT,
ADD COLUMN     "unitPrice" DECIMAL(16,4),
ADD COLUMN     "vendorId" TEXT;

-- CreateTable
CREATE TABLE "LoanScheduleEntry" (
    "id" TEXT NOT NULL,
    "liabilityId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paymentCents" BIGINT NOT NULL,
    "interestCents" BIGINT NOT NULL,
    "principalCents" BIGINT NOT NULL,
    "endingBalanceCents" BIGINT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "LoanScheduleEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enterprise" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "externalId" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "parentId" TEXT,
    "notes" TEXT,

    CONSTRAINT "Enterprise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnterpriseTransfer" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "externalId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "fromEnterpriseId" TEXT NOT NULL,
    "toEnterpriseId" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "head" INTEGER,
    "animalClass" TEXT,
    "description" TEXT,

    CONSTRAINT "EnterpriseTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "externalId" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "paymentTermsDays" INTEGER,
    "location" TEXT,
    "notes" TEXT,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bill" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "enterpriseId" TEXT,
    "billDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "category" TEXT,
    "accountCode" TEXT,
    "description" TEXT,
    "amountCents" BIGINT NOT NULL,
    "amountPaidCents" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3),
    "expectedPaymentAt" TIMESTAMP(3),

    CONSTRAINT "Bill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "externalId" TEXT,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "enterpriseAllocation" TEXT,
    "purchasedAt" TIMESTAMP(3) NOT NULL,
    "originalCostCents" BIGINT NOT NULL,
    "financing" TEXT,
    "liabilityId" TEXT,
    "usefulLifeYears" INTEGER,
    "salvageCents" BIGINT NOT NULL DEFAULT 0,
    "depreciationMethod" TEXT,
    "estCurrentValueCents" BIGINT,
    "repairsByYear" JSONB,
    "usage" TEXT,
    "maintenanceNotes" TEXT,
    "disposedAt" TIMESTAMP(3),
    "disposalProceedsCents" BIGINT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'In service',

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetDepreciation" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "enterpriseId" TEXT,
    "year" INTEGER NOT NULL,
    "amountCents" BIGINT NOT NULL,

    CONSTRAINT "AssetDepreciation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LandParcel" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "externalId" TEXT,
    "name" TEXT NOT NULL,
    "acres" DECIMAL(12,2) NOT NULL,
    "use" TEXT,
    "tenure" TEXT,
    "enterpriseId" TEXT,

    CONSTRAINT "LandParcel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CropSeason" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "externalId" TEXT,
    "enterpriseId" TEXT,
    "crop" TEXT NOT NULL,
    "fieldId" TEXT,
    "year" INTEGER NOT NULL,
    "acres" DECIMAL(12,2) NOT NULL,
    "irrigated" BOOLEAN,
    "plantedAt" TIMESTAMP(3),
    "harvestStart" TIMESTAMP(3),
    "harvestEnd" TIMESTAMP(3),
    "expectedYield" DECIMAL(14,4),
    "actualYield" DECIMAL(14,4),
    "yieldUnit" TEXT,
    "totalProduction" DECIMAL(16,4),
    "expectedPrice" DECIMAL(14,4),
    "actualAvgPrice" DECIMAL(14,4),
    "qtySold" DECIMAL(16,4),
    "extra" JSONB,
    "dataType" TEXT,

    CONSTRAINT "CropSeason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionRecord" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "externalId" TEXT,
    "enterpriseId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "recordType" TEXT NOT NULL,
    "item" TEXT,
    "quantity" DECIMAL(16,4),
    "unit" TEXT,
    "extra" JSONB,
    "dataType" TEXT,

    CONSTRAINT "ProductionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeatherMonth" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "rainfallIn" DECIMAL(8,2) NOT NULL,
    "normalIn" DECIMAL(8,2) NOT NULL,
    "dataType" TEXT,
    "note" TEXT,

    CONSTRAINT "WeatherMonth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Animal" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "species" TEXT NOT NULL,
    "sex" TEXT,
    "breed" TEXT,
    "nameOrTag" TEXT,
    "birthDate" TIMESTAMP(3),
    "origin" TEXT,
    "acquiredAt" TIMESTAMP(3),
    "damId" TEXT,
    "sireId" TEXT,
    "currentClass" TEXT,
    "status" TEXT,
    "dispositionDate" TIMESTAMP(3),
    "dispositionType" TEXT,
    "dispositionDetail" TEXT,
    "weaningWeightLb" DECIMAL(10,2),
    "saleWeightLb" DECIMAL(10,2),
    "salePriceCents" BIGINT,
    "grade" TEXT,
    "aiSired" BOOLEAN,

    CONSTRAINT "Animal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventorySnapshot" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "itemKey" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "enterpriseId" TEXT,
    "quantity" DECIMAL(16,4) NOT NULL,
    "unit" TEXT,
    "costPerUnit" DECIMAL(16,4),
    "marketPerUnit" DECIMAL(16,4),
    "costBasisCents" BIGINT NOT NULL,
    "marketValueCents" BIGINT NOT NULL,
    "bsValuation" TEXT NOT NULL,
    "acquiredOrProduced" TEXT,
    "expectedUseOrSale" TEXT,
    "location" TEXT,

    CONSTRAINT "InventorySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaborEntry" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "enterpriseId" TEXT,
    "workerType" TEXT NOT NULL,
    "worker" TEXT,
    "hours" DECIMAL(10,2) NOT NULL,
    "hourlyCostCents" BIGINT,
    "wagesPaidCents" BIGINT NOT NULL DEFAULT 0,
    "note" TEXT,

    CONSTRAINT "LaborEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpeningBalance" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "line" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,

    CONSTRAINT "OpeningBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnterpriseBudget" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "enterpriseId" TEXT,
    "plannedRevenueCents" BIGINT NOT NULL,
    "plannedExpensesCents" BIGINT NOT NULL,
    "plannedNetIncomeCents" BIGINT NOT NULL,

    CONSTRAINT "EnterpriseBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetMonth" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "monthEnd" TIMESTAMP(3) NOT NULL,
    "revenueCents" BIGINT NOT NULL,
    "copCents" BIGINT NOT NULL,
    "overheadCents" BIGINT NOT NULL,
    "depreciationCents" BIGINT NOT NULL,
    "interestCents" BIGINT NOT NULL,

    CONSTRAINT "BudgetMonth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForecastAssumption" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "scenario" TEXT NOT NULL,
    "driver" TEXT NOT NULL,
    "assumption" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "ForecastAssumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScenarioLever" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "externalId" TEXT,
    "question" TEXT NOT NULL,
    "driver" TEXT NOT NULL,
    "baseValue" TEXT,
    "scenarioChange" TEXT,
    "estimatedImpact" DECIMAL(16,2),
    "impactUnit" TEXT,
    "basis" TEXT,

    CONSTRAINT "ScenarioLever_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SemenEvent" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "bullId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "straws" INTEGER NOT NULL,
    "costCents" BIGINT,
    "dataType" TEXT,

    CONSTRAINT "SemenEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BullValuation" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "name" TEXT,
    "asOf" TIMESTAMP(3) NOT NULL,
    "marketValueCents" BIGINT NOT NULL,
    "insuredValueCents" BIGINT,
    "ageYears" DECIMAL(6,2),
    "strawsOnHand" INTEGER,
    "method" TEXT,

    CONSTRAINT "BullValuation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReproductionYear" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "ReproductionYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedAnimal" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "enterpriseId" TEXT,
    "species" TEXT,
    "processedAt" TIMESTAMP(3),
    "revenueCents" BIGINT,
    "data" JSONB NOT NULL,

    CONSTRAINT "ProcessedAnimal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsightReference" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "category" TEXT,
    "title" TEXT NOT NULL,
    "finding" TEXT,
    "recommendation" TEXT,
    "keyMetrics" JSONB,
    "sourceTables" TEXT,

    CONSTRAINT "InsightReference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LoanScheduleEntry_liabilityId_number_key" ON "LoanScheduleEntry"("liabilityId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Enterprise_farmId_code_key" ON "Enterprise"("farmId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_farmId_externalId_key" ON "Vendor"("farmId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Bill_farmId_number_key" ON "Bill"("farmId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_farmId_externalId_key" ON "Asset"("farmId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "CropSeason_farmId_externalId_key" ON "CropSeason"("farmId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "WeatherMonth_farmId_year_month_key" ON "WeatherMonth"("farmId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "Animal_farmId_externalId_key" ON "Animal"("farmId", "externalId");

-- CreateIndex
CREATE INDEX "InventorySnapshot_farmId_asOf_idx" ON "InventorySnapshot"("farmId", "asOf");

-- CreateIndex
CREATE UNIQUE INDEX "OpeningBalance_farmId_line_key" ON "OpeningBalance"("farmId", "line");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetMonth_farmId_monthEnd_key" ON "BudgetMonth"("farmId", "monthEnd");

-- CreateIndex
CREATE UNIQUE INDEX "ReproductionYear_farmId_year_key" ON "ReproductionYear"("farmId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_farmId_externalId_key" ON "Customer"("farmId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Farm_externalId_key" ON "Farm"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Liability_farmId_externalId_key" ON "Liability"("farmId", "externalId");

-- CreateIndex
CREATE INDEX "Transaction_farmId_cashDate_idx" ON "Transaction"("farmId", "cashDate");

-- CreateIndex
CREATE INDEX "Transaction_farmId_enterpriseId_idx" ON "Transaction"("farmId", "enterpriseId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_cropSeasonId_fkey" FOREIGN KEY ("cropSeasonId") REFERENCES "CropSeason"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanScheduleEntry" ADD CONSTRAINT "LoanScheduleEntry_liabilityId_fkey" FOREIGN KEY ("liabilityId") REFERENCES "Liability"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enterprise" ADD CONSTRAINT "Enterprise_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enterprise" ADD CONSTRAINT "Enterprise_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Enterprise"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnterpriseTransfer" ADD CONSTRAINT "EnterpriseTransfer_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_liabilityId_fkey" FOREIGN KEY ("liabilityId") REFERENCES "Liability"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetDepreciation" ADD CONSTRAINT "AssetDepreciation_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandParcel" ADD CONSTRAINT "LandParcel_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandParcel" ADD CONSTRAINT "LandParcel_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CropSeason" ADD CONSTRAINT "CropSeason_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CropSeason" ADD CONSTRAINT "CropSeason_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionRecord" ADD CONSTRAINT "ProductionRecord_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeatherMonth" ADD CONSTRAINT "WeatherMonth_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Animal" ADD CONSTRAINT "Animal_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventorySnapshot" ADD CONSTRAINT "InventorySnapshot_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaborEntry" ADD CONSTRAINT "LaborEntry_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningBalance" ADD CONSTRAINT "OpeningBalance_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnterpriseBudget" ADD CONSTRAINT "EnterpriseBudget_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetMonth" ADD CONSTRAINT "BudgetMonth_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForecastAssumption" ADD CONSTRAINT "ForecastAssumption_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioLever" ADD CONSTRAINT "ScenarioLever_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SemenEvent" ADD CONSTRAINT "SemenEvent_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BullValuation" ADD CONSTRAINT "BullValuation_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReproductionYear" ADD CONSTRAINT "ReproductionYear_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessedAnimal" ADD CONSTRAINT "ProcessedAnimal_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsightReference" ADD CONSTRAINT "InsightReference_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Backfill: existing rows were cash-basis, so cash moved on the transaction date.
UPDATE "Transaction" SET "cashDate" = "date", "cashEffectCents" = "amountCents" WHERE "cashDate" IS NULL;

-- Backfill statement sections for the Schedule F chart of accounts.
UPDATE "Account" SET "section" = CASE
  WHEN "kind" = 'INCOME' THEN 'REV'
  WHEN "scheduleFCode" IN ('interest_mortgage', 'interest_other') THEN 'INT'
  WHEN "scheduleFCode" = 'depreciation' THEN 'DEP'
  WHEN "scheduleFCode" IN ('insurance', 'other_expense') THEN 'OVH'
  ELSE 'COP' END
WHERE "section" = '';
