-- AlterTable
ALTER TABLE "Lease" ADD COLUMN     "nextPaymentAt" TIMESTAMP(3),
ADD COLUMN     "paymentFreq" TEXT NOT NULL DEFAULT 'annual';

-- AlterTable
ALTER TABLE "Liability" ADD COLUMN     "paymentFreq" TEXT NOT NULL DEFAULT 'monthly';

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "leaseId" TEXT,
ADD COLUMN     "liabilityId" TEXT;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_liabilityId_fkey" FOREIGN KEY ("liabilityId") REFERENCES "Liability"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE SET NULL ON UPDATE CASCADE;
