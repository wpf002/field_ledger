import "./load-env.js"; // must be first — loads root .env before Prisma client
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { balanceSheetAt, incomeStatement, type BalanceSheet, type IncomeStatement } from "@fl/core";
import { prisma } from "../src/index.js";
import { loadStatementInputs } from "../src/statement-inputs.js";
import { readWorkbook, toCents, toDate, type Row } from "../src/testfarms/workbook.js";
import { DATA_DIR } from "./import-testfarms.js";

/**
 * Phase 10 acceptance: statements computed by the app from imported records must
 * match each workbook's statement tabs to the cent. Run after import:testfarms.
 *   pnpm --filter @fl/db verify:testfarms
 */
const IS_LINES: Record<string, keyof IncomeStatement> = {
  "Revenue": "revenueCents", "Cost of production": "copCents", "Gross profit": "grossProfitCents",
  "Overhead / operating expenses": "overheadCents", "EBITDA": "ebitdaCents", "Depreciation": "depreciationCents",
  "Operating profit": "operatingProfitCents", "Interest": "interestCents", "Gain (loss) on asset sales": "gainCents",
  "Net income (operating basis)": "netIncomeOperatingCents", "Change in crop/hay/feed/supply inventories": "inventoryChangeCents",
  "Change in livestock values": "livestockChangeCents", "Net farm income (accrual)": "netFarmIncomeCents",
};
const BS_LINES: Record<string, keyof BalanceSheet> = {
  "Cash": "cashCents", "Accounts receivable": "arCents", "Prepaid expenses": "prepaidCents", "Crop & hay inventory": "cropInventoryCents",
  "Feed inventory": "feedCents", "Investment in growing crops": "growingCropsCents", "Supplies, semen & packaged meat": "suppliesCents",
  "Market livestock": "marketLivestockCents", "Total current assets": "totalCurrentAssetsCents", "Breeding livestock (market)": "breedingLivestockCents",
  "Machinery & equipment (net)": "machineryCents", "Vehicles (net)": "vehiclesCents", "Buildings & improvements (net)": "buildingsCents",
  "Land (cost basis)": "landCents", "Total non-current assets": "totalNonCurrentAssetsCents", "TOTAL ASSETS": "totalAssetsCents",
  "Accounts payable": "apCents", "Credit cards": "creditCardsCents", "Accrued property tax": "accruedPropertyTaxCents",
  "Accrued payroll tax": "accruedPayrollTaxCents", "Customer deposits (deferred revenue)": "customerDepositsCents",
  "Operating line": "operatingLineCents", "Current portion of term debt": "currentPortionCents",
  "Total current liabilities": "totalCurrentLiabilitiesCents", "TOTAL LIABILITIES": "totalLiabilitiesCents",
  "Owner contributed capital": "contributedCents", "Retained earnings": "retainedCents", "TOTAL EQUITY": "totalEquityCents",
  "Balance check (assets - liabilities - equity)": "balanceCheckCents",
};
// The workbook nets the whole current portion against the land-loan line; the app
// splits it per loan (GAAP). Compare these four lines as a total.
const NON_CURRENT = ["Land loans (non-current)", "Equipment loans (non-current)", "Vehicle loans (non-current)", "Other term debt (non-current)"];

type Result = { check: string; compared: number; failures: string[] };

async function verifyFarm(file: string): Promise<Result[]> {
  const { tables } = await readWorkbook(resolve(DATA_DIR, file));
  const bizId = String(tables.Transactions![0]!.business_id);
  const farm = await prisma.farm.findUniqueOrThrow({ where: { externalId: bizId } });
  const inputs = await loadStatementInputs(prisma, farm.id);
  const results: Result[] = [];
  const cmp = (r: Result, label: string, expected: bigint, actual: bigint) => {
    r.compared++;
    if (expected !== actual) r.failures.push(`${label}: expected ${expected} got ${actual}`);
  };
  const monthCols = (rows: Row[]) => Object.keys(rows[0] ?? {}).filter((k) => k !== "Line item").map((k) => ({ key: k, date: toDate(k)! }));

  // Income statement, every month.
  const isRes: Result = { check: "Income statement (monthly)", compared: 0, failures: [] };
  const isRows = tables.IS_Monthly!;
  for (const { key, date } of monthCols(isRows)) {
    const from = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 0));
    const is = incomeStatement(inputs.rows, from, date);
    for (const row of isRows) {
      const field = IS_LINES[String(row["Line item"])];
      if (field) cmp(isRes, `${key} ${row["Line item"]}`, toCents(row[key]), is[field] as bigint);
    }
  }
  results.push(isRes);

  // Balance sheet, every month-end.
  const bsRes: Result = { check: "Balance sheet (month-end)", compared: 0, failures: [] };
  const bsRows = tables.BS_Monthly!;
  for (const { key, date } of monthCols(bsRows)) {
    const bs = balanceSheetAt(inputs, date);
    let expectedNonCurrent = 0n;
    for (const row of bsRows) {
      const label = String(row["Line item"]);
      if (NON_CURRENT.includes(label)) { expectedNonCurrent += toCents(row[key]); continue; }
      const field = BS_LINES[label];
      if (field) cmp(bsRes, `${key} ${label}`, toCents(row[key]), bs[field] as bigint);
    }
    cmp(bsRes, `${key} non-current term debt`, expectedNonCurrent, bs.landLoansCents + bs.equipmentLoansCents + bs.vehicleLoansCents + bs.otherTermDebtCents);
  }
  results.push(bsRes);

  // Sub-ledgers at the cutoff.
  const subRes: Result = { check: "AR, debt, herd flow", compared: 0, failures: [] };
  const cutoff = inputs.cutoff!;
  const bsCut = balanceSheetAt(inputs, cutoff);
  const invoices = await prisma.invoice.findMany({ where: { farmId: farm.id } });
  const openAr = invoices.reduce((s, i) => s + i.totalCents - i.amountPaidCents, 0n);
  cmp(subRes, "open AR invoices vs BS AR", openAr, bsCut.arCents);
  const loans = await prisma.liability.findMany({ where: { farmId: farm.id } });
  cmp(subRes, "loan principal vs BS debt", loans.reduce((s, l) => s + l.balanceCents, 0n),
    bsCut.operatingLineCents + bsCut.currentPortionCents + bsCut.landLoansCents + bsCut.equipmentLoansCents + bsCut.vehicleLoansCents + bsCut.otherTermDebtCents);
  const herd = await prisma.herdFlowMonth.findMany({ where: { farmId: farm.id }, orderBy: { monthEnd: "asc" } });
  const lastEnding = new Map<string, number>();
  for (const h of herd) {
    const calc = h.opening + h.births + h.purchases + h.transfersIn - h.transfersOut - h.deaths - h.cullsSold - h.sales - h.processed - h.householdUse;
    cmp(subRes, `herd ${h.monthEnd.toISOString().slice(0, 7)} ${h.animalClass} roll`, BigInt(h.ending), BigInt(calc));
    const prev = lastEnding.get(h.animalClass);
    if (prev != null) cmp(subRes, `herd ${h.monthEnd.toISOString().slice(0, 7)} ${h.animalClass} opening = prior ending`, BigInt(prev), BigInt(h.opening));
    lastEnding.set(h.animalClass, h.ending);
  }
  // Checks tab: revenue / COP / interest by year (through the cutoff).
  for (const row of tables.Checks ?? []) {
    const year = Number(row.Year);
    if (!year) continue;
    const is = incomeStatement(inputs.rows, new Date(Date.UTC(year - 1, 11, 31)), year === cutoff.getUTCFullYear() ? cutoff : new Date(Date.UTC(year, 11, 31)));
    const label = String(row.Check);
    const actual = label.startsWith("Revenue") ? is.revenueCents : label.startsWith("Cost of production") ? is.copCents : is.interestCents;
    cmp(subRes, `Checks ${year} ${label.split(":")[0]}`, toCents(row["Statement value"]), actual);
  }
  results.push(subRes);
  return results;
}

async function main() {
  let failed = 0;
  for (const f of readdirSync(DATA_DIR).filter((x) => x.endsWith(".xlsx")).sort()) {
    for (const r of await verifyFarm(f)) {
      const ok = r.failures.length === 0;
      if (!ok) failed++;
      console.log(`${ok ? "PASS" : "FAIL"}  ${f.split("_")[0]}  ${r.check}: ${r.compared - r.failures.length}/${r.compared}`);
      for (const msg of r.failures.slice(0, 5)) console.log(`        ${msg}`);
    }
  }
  if (failed) process.exitCode = 1;
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
