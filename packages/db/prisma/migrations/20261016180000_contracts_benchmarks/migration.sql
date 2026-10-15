-- CreateTable
CREATE TABLE "MarketingContract" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "externalId" TEXT,
    "number" TEXT,
    "commodity" TEXT NOT NULL,
    "cropYear" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" DECIMAL(16,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "price" DECIMAL(16,4),
    "basis" DECIMAL(16,4),
    "buyer" TEXT,
    "deliveryStart" TIMESTAMP(3),
    "deliveryEnd" TIMESTAMP(3),
    "delivered" DECIMAL(16,4) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'open',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Benchmark" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "region" TEXT NOT NULL,
    "farmType" TEXT,
    "metric" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "median" DOUBLE PRECISION,

    CONSTRAINT "Benchmark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketingContract_farmId_cropYear_idx" ON "MarketingContract"("farmId", "cropYear");

-- CreateIndex
CREATE UNIQUE INDEX "Benchmark_farmId_source_year_region_metric_key" ON "Benchmark"("farmId", "source", "year", "region", "metric");

-- AddForeignKey
ALTER TABLE "MarketingContract" ADD CONSTRAINT "MarketingContract_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Benchmark" ADD CONSTRAINT "Benchmark_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

