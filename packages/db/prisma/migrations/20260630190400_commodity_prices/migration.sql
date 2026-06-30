-- CreateTable
CREATE TABLE "CommodityPrice" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "label" TEXT,
    "unit" TEXT NOT NULL,
    "priceCents" BIGINT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "asOf" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommodityPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommodityPrice_symbol_asOf_idx" ON "CommodityPrice"("symbol", "asOf");
