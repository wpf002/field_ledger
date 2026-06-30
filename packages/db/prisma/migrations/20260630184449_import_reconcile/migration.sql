-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "dedupeHash" TEXT,
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "importBatchId" TEXT,
ADD COLUMN     "reconciled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reconciledAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "filename" TEXT,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Transaction_farmId_dedupeHash_idx" ON "Transaction"("farmId", "dedupeHash");

-- CreateIndex
CREATE INDEX "Transaction_farmId_externalId_idx" ON "Transaction"("farmId", "externalId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
