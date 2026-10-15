-- CreateTable
CREATE TABLE "LandValuation" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "marketValueCents" BIGINT NOT NULL,
    "source" TEXT,

    CONSTRAINT "LandValuation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LandValuation_farmId_asOf_key" ON "LandValuation"("farmId", "asOf");

-- AddForeignKey
ALTER TABLE "LandValuation" ADD CONSTRAINT "LandValuation_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

