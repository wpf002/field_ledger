-- CreateTable
CREATE TABLE "HerdFlowMonth" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "monthEnd" TIMESTAMP(3) NOT NULL,
    "species" TEXT NOT NULL,
    "animalClass" TEXT NOT NULL,
    "category" TEXT,
    "opening" INTEGER NOT NULL,
    "births" INTEGER NOT NULL DEFAULT 0,
    "purchases" INTEGER NOT NULL DEFAULT 0,
    "transfersIn" INTEGER NOT NULL DEFAULT 0,
    "transfersOut" INTEGER NOT NULL DEFAULT 0,
    "deaths" INTEGER NOT NULL DEFAULT 0,
    "cullsSold" INTEGER NOT NULL DEFAULT 0,
    "sales" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "householdUse" INTEGER NOT NULL DEFAULT 0,
    "ending" INTEGER NOT NULL,

    CONSTRAINT "HerdFlowMonth_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HerdFlowMonth_farmId_monthEnd_idx" ON "HerdFlowMonth"("farmId", "monthEnd");

-- AddForeignKey
ALTER TABLE "HerdFlowMonth" ADD CONSTRAINT "HerdFlowMonth_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

