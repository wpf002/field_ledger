-- AlterTable
ALTER TABLE "EnterpriseBudget" ADD COLUMN     "period" TEXT NOT NULL DEFAULT 'Full year';

-- AlterTable
ALTER TABLE "ScenarioLever" ADD COLUMN     "params" JSONB,
ADD COLUMN     "template" TEXT;

