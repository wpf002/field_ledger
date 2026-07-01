import "./load-env.js"; // must be first — loads root .env before Prisma client
import {
  prisma,
  hashPassword,
  AccountKind,
  InventoryCategory,
  LiabilityType,
  LeaseType,
  InvoiceStatus,
  BasisType,
  BudgetPeriod,
  Role,
} from "../src/index.js";
import { SCHEDULE_F } from "@fl/core";

/**
 * Seeds the demo "Field & Ledger" farm mirroring the reference screenshots,
 * with all money as integer cents (Invariant 1). Idempotent: wipes the demo
 * farm's rows first so `pnpm db:seed` can be re-run. Run: pnpm db:seed
 *
 * Every figure here is sampled from the original Base44 screenshots and
 * reconciles to the dashboard KPIs:
 *   income  673065 + 500000 + 1500000               = 2673065  ($26,730.65)
 *   expense  50000 +  45000 +  120000 + 250000       =  465000  ($4,650)
 *   net                                              = 2208065  ($22,080.65)
 *   inventory 8100000 + 6000000 + 7000000 + 12000000 = 33100000 ($331,000)
 */

// Display labels for the categories that appear in the UI. The chart of
// accounts keeps the formal IRS Schedule F label for everything else.
const LABEL_OVERRIDES: Record<string, string> = {
  livestock_sales_raised: "Livestock Sales",
  crop_sales: "Crop Sales",
  feed: "Feed",
  fuel: "Fuel",
  veterinary: "Veterinary",
  fertilizer: "Fertilizer",
};

async function main() {
  // --- reset demo data (FK-safe order) ---
  const existing = await prisma.farm.findMany({ select: { id: true } });
  for (const { id } of existing) {
    await prisma.transaction.deleteMany({ where: { farmId: id } });
    await prisma.importBatch.deleteMany({ where: { farmId: id } });
    await prisma.invoiceLineItem.deleteMany({ where: { invoice: { farmId: id } } });
    await prisma.invoice.deleteMany({ where: { farmId: id } });
    await prisma.customer.deleteMany({ where: { farmId: id } });
    await prisma.inventoryItem.deleteMany({ where: { farmId: id } });
    await prisma.liability.deleteMany({ where: { farmId: id } });
    await prisma.lease.deleteMany({ where: { farmId: id } });
    await prisma.budget.deleteMany({ where: { farmId: id } });
    await prisma.financialGoal.deleteMany({ where: { farmId: id } });
    await prisma.productionPlan.deleteMany({ where: { farmId: id } });
    await prisma.alert.deleteMany({ where: { farmId: id } });
    await prisma.auditLog.deleteMany({ where: { farmId: id } });
    await prisma.alertSetting.deleteMany({ where: { farmId: id } });
    await prisma.alertDismissal.deleteMany({ where: { farmId: id } });
    await prisma.accountingPeriod.deleteMany({ where: { farmId: id } });
    await prisma.account.deleteMany({ where: { farmId: id } });
    await prisma.membership.deleteMany({ where: { farmId: id } });
    await prisma.farm.delete({ where: { id } });
  }
  await prisma.user.deleteMany({});           // users are not farm-scoped
  await prisma.commodityPrice.deleteMany({}); // global quote store

  const farm = await prisma.farm.create({ data: { name: "Field & Ledger Demo Farm" } });

  // --- chart of accounts from Schedule F (Invariant 6) ---
  for (const l of Object.values(SCHEDULE_F)) {
    await prisma.account.create({
      data: {
        farmId: farm.id,
        code: l.code,
        label: LABEL_OVERRIDES[l.code] ?? l.label,
        kind: l.kind === "income" ? AccountKind.INCOME : AccountKind.EXPENSE,
        scheduleFCode: l.code,
      },
    });
  }
  const acct = async (code: string) =>
    (await prisma.account.findUniqueOrThrow({ where: { farmId_code: { farmId: farm.id, code } } })).id;

  // --- accounting periods (Invariant 2: closed years locked) ---
  await prisma.accountingPeriod.create({ data: { farmId: farm.id, year: 2023, locked: true, lockedAt: new Date("2024-04-15") } });
  await prisma.accountingPeriod.create({ data: { farmId: farm.id, year: 2024, locked: true, lockedAt: new Date("2025-04-15") } });
  await prisma.accountingPeriod.create({ data: { farmId: farm.id, year: 2026, locked: false } });

  // --- commodity prices (Phase 2 mark-to-market) ---
  // Quotes the marketable inventory is valued at. Seeded at the screenshot
  // prices so default values match; a live USDA/CME feed can upsert these later.
  await prisma.commodityPrice.create({ data: { symbol: "LE=F", label: "Live Cattle", unit: "head", priceCents: 180000n, source: "usda", asOf: new Date("2026-06-15") } });
  await prisma.commodityPrice.create({ data: { symbol: "ZW=F", label: "Wheat", unit: "bushel", priceCents: 1400n, source: "usda", asOf: new Date("2026-06-15") } });

  // --- inventory ---
  // Marketable items carry a marketSymbol and NO override (unitValueCents null)
  // so they value off the live quote. Raised livestock/crops have $0 tax basis.
  const angus = await prisma.inventoryItem.create({
    data: {
      farmId: farm.id, category: InventoryCategory.LIVESTOCK, name: "Angus Cattle",
      quantity: 45, unit: "head", location: "North Pasture",
      marketSymbol: "LE=F", basisType: BasisType.RAISED, costBasisCents: 0n,
    },
  });
  await prisma.inventoryItem.create({
    data: {
      farmId: farm.id, category: InventoryCategory.FEED, name: "Hay Bales",
      quantity: 200, unit: "bales", location: "Feed Shed",
      unitValueCents: 30000n, // no commodity feed; valued at a manual per-bale price
    },
  });
  await prisma.inventoryItem.create({
    data: {
      farmId: farm.id, category: InventoryCategory.CROPS, name: "Winter Wheat",
      quantity: 5000, unit: "bushels", location: "Silo 1",
      marketSymbol: "ZW=F", basisType: BasisType.RAISED, costBasisCents: 0n,
    },
  });
  // Equipment: valued at depreciated book value. $150k cost, $30k salvage,
  // 10yr straight-line, bought mid-2021 -> ~5yr depreciation by 2026.
  await prisma.inventoryItem.create({
    data: {
      farmId: farm.id, category: InventoryCategory.EQUIPMENT, name: "John Deere 8R",
      quantity: 1, unit: "units", location: "Main Barn",
      basisType: BasisType.PURCHASED, costBasisCents: 15000000n,
      acquiredAt: new Date("2021-06-30"), usefulLifeYears: 10, salvageCents: 3000000n,
    },
  });

  // --- transactions (signed cents: income +, expense -) ---
  const tx = [
    { date: "2026-03-14", description: "Sold 5 head of cattle at Weatherford Cattle Auction", code: "livestock_sales_raised", amountCents: 673065n, relatedInventoryId: angus.id },
    { date: "2026-03-13", description: "Bought 400 lbs of mixed cube feed for cattle from Tractor Supply", code: "feed", amountCents: -50000n, relatedLabel: "mixed cube feed" },
    // 2026 operating expenses across the year — drive budget-vs-actual (Phase 5)
    { date: "2026-02-08", description: "Diesel delivery", code: "fuel", amountCents: -52000n },
    { date: "2026-04-18", description: "Spring fertilizer — north fields", code: "fertilizer", amountCents: -680000n },
    { date: "2026-05-12", description: "Feed restock", code: "feed", amountCents: -115000n },
    { date: "2026-06-09", description: "Combine belt repair", code: "repairs_maintenance", amountCents: -110000n },
    { date: "2026-06-21", description: "Herd health check", code: "veterinary", amountCents: -115000n },
    { date: "2023-11-09", description: "Diesel for tractors", code: "fuel", amountCents: -45000n },
    { date: "2023-11-04", description: "Fall vaccinations", code: "veterinary", amountCents: -120000n },
    { date: "2023-10-31", description: "Soybean harvest batch 1", code: "crop_sales", amountCents: 500000n },
    { date: "2023-10-19", description: "Winter feed supply", code: "feed", amountCents: -250000n },
    { date: "2023-10-14", description: "Sold 10 head of cattle", code: "livestock_sales_raised", amountCents: 1500000n },
  ] as const;
  for (const t of tx) {
    await prisma.transaction.create({
      data: {
        farmId: farm.id, date: new Date(t.date), description: t.description,
        accountId: await acct(t.code), amountCents: t.amountCents,
        relatedInventoryId: "relatedInventoryId" in t ? t.relatedInventoryId : null,
        relatedLabel: "relatedLabel" in t ? t.relatedLabel : null,
      },
    });
  }

  // --- liabilities ---
  await prisma.liability.create({
    data: {
      farmId: farm.id, type: LiabilityType.EQUIPMENT_LOAN, name: "Tractor Loan", lender: "AgriBank",
      originalCents: 18000000n, balanceCents: 15000000n, ratePct: 6.5,
      nextPaymentAt: new Date("2026-11-30"), paymentCents: 250000n,
    },
  });
  await prisma.liability.create({
    data: {
      farmId: farm.id, type: LiabilityType.OPERATING_LINE, name: "Operating Line 2023", lender: "Farm Credit",
      originalCents: 10000000n, balanceCents: 7500000n, ratePct: 7.2,
      nextPaymentAt: new Date("2027-01-14"), paymentCents: 150000n,
    },
  });

  // --- leases ---
  await prisma.lease.create({
    data: {
      farmId: farm.id, type: LeaseType.CASH_RENT, name: "River Bottom Fields", lessor: "Smith Family Trust",
      acres: 350, termStart: new Date("2022-01-01"), termEnd: new Date("2025-12-31"), annualRentCents: 4500000n,
    },
  });
  await prisma.lease.create({
    data: {
      farmId: farm.id, type: LeaseType.CROP_SHARE, name: "Hillside Pasture", lessor: "Neighbor Jones",
      acres: 120, termStart: new Date("2023-01-01"), termEnd: new Date("2024-12-31"), annualRentCents: null,
    },
  });
  // Active cash-rent lease — drives the obligations engine (the two above are
  // expired and kept for Phase 4 lease-expiry alerts).
  await prisma.lease.create({
    data: {
      farmId: farm.id, type: LeaseType.CASH_RENT, name: "Bottomland Tract", lessor: "Hartley Trust",
      acres: 180, termStart: new Date("2025-01-01"), termEnd: new Date("2028-12-31"),
      annualRentCents: 4500000n, paymentFreq: "annual", nextPaymentAt: new Date("2026-07-15"),
    },
  });

  // --- customers + invoices ---
  const greenValley = await prisma.customer.create({ data: { farmId: farm.id, name: "Green Valley Restaurant" } });
  const johnson = await prisma.customer.create({ data: { farmId: farm.id, name: "Johnson Family Farm" } });
  await prisma.invoice.create({
    data: {
      farmId: farm.id, number: "INV-2024-002", customerId: greenValley.id, status: InvoiceStatus.SENT,
      issuedAt: new Date("2024-12-14"), dueAt: new Date("2025-01-14"), totalCents: 48375n,
    },
  });
  await prisma.invoice.create({
    data: {
      farmId: farm.id, number: "INV-2024-001", customerId: johnson.id, status: InvoiceStatus.PAID,
      issuedAt: new Date("2024-11-30"), dueAt: new Date("2024-12-30"), totalCents: 6000000n,
    },
  });

  // --- budgets (2026, drive the Budgets page + Dashboard Budget Health vs real
  //     spend). Monthly budgets are recurring (month null); vet is intentionally
  //     over budget to exercise the budget_over alert. ---
  await prisma.budget.create({ data: { farmId: farm.id, period: BudgetPeriod.MONTHLY, year: 2026, month: null, accountCode: "feed", amountCents: 35000n } });
  await prisma.budget.create({ data: { farmId: farm.id, period: BudgetPeriod.MONTHLY, year: 2026, month: null, accountCode: "fuel", amountCents: 15000n } });
  await prisma.budget.create({ data: { farmId: farm.id, period: BudgetPeriod.ANNUAL, year: 2026, month: null, accountCode: "fertilizer", amountCents: 800000n } });
  await prisma.budget.create({ data: { farmId: farm.id, period: BudgetPeriod.ANNUAL, year: 2026, month: null, accountCode: "repairs_maintenance", amountCents: 250000n } });
  await prisma.budget.create({ data: { farmId: farm.id, period: BudgetPeriod.ANNUAL, year: 2026, month: null, accountCode: "veterinary", amountCents: 100000n } });

  // --- financial goals ---
  await prisma.financialGoal.create({
    data: { farmId: farm.id, name: "New Combine Fund", kind: "savings", targetCents: 12000000n, currentCents: 1500000n, dueAt: new Date("2025-05-01"), note: "Saving for a used John Deere combine" },
  });
  await prisma.financialGoal.create({
    data: { farmId: farm.id, name: "2024 Gross Revenue", kind: "income_target", targetCents: 15000000n, currentCents: 4500000n, dueAt: new Date("2024-12-01") },
  });

  // --- production plans (Phase 5: render on the Planning calendar + list) ---
  const plans = [
    { title: "Spring calving", kind: "calving", startAt: "2026-03-01", endAt: "2026-04-15", note: "First-calf heifers, North Pasture" },
    { title: "Corn planting — North Field", kind: "planting", startAt: "2026-04-15", endAt: "2026-04-30", note: "120 acres" },
    { title: "Soybean planting — Bottomland", kind: "planting", startAt: "2026-05-10", endAt: "2026-05-25", note: "Bottomland Tract" },
    { title: "Pasture rotation", kind: "other", startAt: "2026-06-10", endAt: "2026-06-12", note: null },
    { title: "First hay cutting", kind: "harvest", startAt: "2026-06-20", endAt: "2026-06-25", note: "Aim for 200 bales" },
    { title: "Winter wheat harvest", kind: "harvest", startAt: "2026-07-05", endAt: "2026-07-25", note: "Silo 1" },
  ] as const;
  for (const p of plans) {
    await prisma.productionPlan.create({
      data: { farmId: farm.id, title: p.title, kind: p.kind, startAt: new Date(p.startAt), endAt: new Date(p.endAt), note: p.note ?? null },
    });
  }

  // --- second farm (multi-farm demo for the farm switcher) ---
  const farm2 = await prisma.farm.create({ data: { name: "River Bend Farm" } });
  for (const l of Object.values(SCHEDULE_F)) {
    await prisma.account.create({ data: { farmId: farm2.id, code: l.code, label: LABEL_OVERRIDES[l.code] ?? l.label, kind: l.kind === "income" ? AccountKind.INCOME : AccountKind.EXPENSE, scheduleFCode: l.code } });
  }
  await prisma.accountingPeriod.create({ data: { farmId: farm2.id, year: 2026, locked: false } });
  const acct2 = async (code: string) => (await prisma.account.findUniqueOrThrow({ where: { farmId_code: { farmId: farm2.id, code } } })).id;
  await prisma.transaction.create({ data: { farmId: farm2.id, date: new Date("2026-05-01"), description: "Corn sales — first load", accountId: await acct2("crop_sales"), amountCents: 820000n } });
  await prisma.transaction.create({ data: { farmId: farm2.id, date: new Date("2026-05-03"), description: "Seed corn", accountId: await acct2("seeds_plants"), amountCents: -310000n } });

  // --- users + memberships (Phase 8 auth). Owner has full access to both
  //     farms; Viewer is read-only on the main farm. ---
  const demoPassword = hashPassword("demo1234"); // shared demo credential
  const owner = await prisma.user.create({ data: { email: "owner@fieldandledger.test", name: "Sam Rivera", passwordHash: demoPassword } });
  const viewer = await prisma.user.create({ data: { email: "viewer@fieldandledger.test", name: "Jordan Bell", passwordHash: demoPassword } });
  await prisma.membership.create({ data: { userId: owner.id, farmId: farm.id, role: Role.OWNER } });
  await prisma.membership.create({ data: { userId: owner.id, farmId: farm2.id, role: Role.OWNER } });
  await prisma.membership.create({ data: { userId: viewer.id, farmId: farm.id, role: Role.VIEWER } });

  console.log("Seeded demo farm:", farm.id, "+ River Bend Farm:", farm2.id, "+ users owner/viewer");
}

main().then(() => prisma.$disconnect()).catch(async (e) => {
  console.error(e); await prisma.$disconnect(); process.exit(1);
});
