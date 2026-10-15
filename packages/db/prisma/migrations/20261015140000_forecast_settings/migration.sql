-- CreateTable
CREATE TABLE "ForecastSetting" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "reserveCents" BIGINT NOT NULL DEFAULT 2500000,
    "scenarios" JSONB,

    CONSTRAINT "ForecastSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForecastRun" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "scenario" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "months" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForecastRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ForecastSetting_farmId_key" ON "ForecastSetting"("farmId");

-- CreateIndex
CREATE INDEX "ForecastRun_farmId_asOf_idx" ON "ForecastRun"("farmId", "asOf");

-- AddForeignKey
ALTER TABLE "ForecastSetting" ADD CONSTRAINT "ForecastSetting_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForecastRun" ADD CONSTRAINT "ForecastRun_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

