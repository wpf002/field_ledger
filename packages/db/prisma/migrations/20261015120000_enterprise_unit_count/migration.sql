-- CreateTable
CREATE TABLE "EnterpriseUnitCount" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "enterpriseId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "basis" TEXT NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "EnterpriseUnitCount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EnterpriseUnitCount_farmId_enterpriseId_year_key" ON "EnterpriseUnitCount"("farmId", "enterpriseId", "year");

-- AddForeignKey
ALTER TABLE "EnterpriseUnitCount" ADD CONSTRAINT "EnterpriseUnitCount_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

