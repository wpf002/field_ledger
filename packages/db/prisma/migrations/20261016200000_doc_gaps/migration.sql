-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'ACCOUNTANT';

-- AlterTable
ALTER TABLE "Animal" ADD COLUMN     "buyer" TEXT;

-- AlterTable
ALTER TABLE "Farm" ADD COLUMN     "entityGroup" TEXT,
ADD COLUMN     "plan" TEXT NOT NULL DEFAULT 'pro',
ADD COLUMN     "stripeCustomerId" TEXT,
ADD COLUMN     "stripeSubscriptionId" TEXT,
ADD COLUMN     "subscriptionStatus" TEXT;

-- AlterTable
ALTER TABLE "ForecastSetting" ADD COLUMN     "revenueDrivers" JSONB;

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "dashboardTiles" JSONB;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "landParcelId" TEXT;

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "body" TEXT NOT NULL,
    "authorId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Note_farmId_createdAt_idx" ON "Note"("farmId", "createdAt");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_landParcelId_fkey" FOREIGN KEY ("landParcelId") REFERENCES "LandParcel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

