import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { readWorkbook, toDate, toCents, centsOrNull, str, num, int, bool, type Row, type Cell } from "./workbook.js";
import { DATASET_SCHEDULE_F, kindForSection, SIGN } from "./accounts.js";
import { DATASET_LEVERS } from "./levers.js";

/**
 * Imports one test-farm workbook as a farm. Idempotent: an existing farm with the
 * same business_id is wiped and rebuilt. Statement tabs (IS/BS/CF, ratios,
 * forecasts, unit economics) are NOT imported; the app computes them, and
 * verify.ts compares the results against those tabs.
 */
export const CUTOFF = new Date(Date.UTC(2026, 8, 30));
const ADJUSTMENT_SECTIONS = new Set(["DEP", "INVCHG", "LVCHG", "XFER", "GAIN"]);

const LIABILITY_TYPE = (debtType: string | null) =>
  debtType === "Land loan" ? "MORTGAGE"
  : debtType === "Equipment loan" || debtType === "Vehicle loan" ? "EQUIPMENT_LOAN"
  : debtType?.startsWith("Operating line") ? "OPERATING_LINE"
  : "OTHER";

const FREQ = (f: string | null) => {
  const x = (f ?? "").toLowerCase();
  return x.startsWith("semi") ? "semiannual" : x.startsWith("annual") ? "annual" : x.startsWith("quarter") ? "quarterly" : "monthly";
};

/** Copy every column not in `known` into a JSON bag (farm-specific columns). */
function extra(r: Row, known: string[]): Prisma.InputJsonObject {
  const o: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(r)) if (!known.includes(k)) o[k] = v instanceof Date ? v.toISOString().slice(0, 10) : v;
  return o;
}
const req = <T>(v: T | null | undefined, what: string): T => { if (v == null) throw new Error(`Missing ${what}`); return v; };
const ent = (code: string) => code.split("-").slice(2).join("-"); // ENT-RCK-COM -> COM, ENT-BRN-PRD-TOM -> PRD-TOM

export type ImportResult = { farmId: string; name: string; counts: Record<string, number> };

export async function importTestFarm(prisma: PrismaClient, path: string): Promise<ImportResult> {
  const { readme, tables: T } = await readWorkbook(path);
  const t = (name: string) => T[name] ?? [];
  const counts: Record<string, number> = {};
  const bizId = req(str(t("Transactions")[0]?.business_id ?? null), "business_id");

  // ---------- farm ----------
  const old = await prisma.farm.findUnique({ where: { externalId: bizId } });
  if (old) {
    const { wipeFarm } = await import("../wipe.js");
    await wipeFarm(prisma, old.id);
  }
  const profile: Record<string, string> = {};
  for (const line of readme.slice(1)) {
    const m = /^([A-Z][A-Za-z ]+): (.+)$/.exec(line);
    if (m) profile[m[1]!.trim()] = m[2]!.trim();
  }
  const farm = await prisma.farm.create({
    data: {
      name: readme[0] ?? bizId, externalId: bizId,
      ownerName: profile["Owner"] ?? null, location: profile["Location"] ?? null,
      structure: profile["Business Structure"] ?? null,
      acres: profile["Total Acres"] ? Number(profile["Total Acres"].replace(/[^0-9.]/g, "")) : null,
      accountingMethod: profile["Accounting Method"] ?? null,
      profile: { ...profile, summary: readme[1] ?? "" }, reportCutoff: CUTOFF,
      // Annual owner labor & management charge (FY2023 is a 365-day year).
      ownerLaborChargeCents: t("Ratios")[0] ? toCents(t("Ratios")[0]!.owner_labor_mgmt_charge) : null,
    },
  });
  const farmId = farm.id;

  // ---------- chart of accounts ----------
  const accountId = new Map<string, string>();
  const accounts = t("Chart_of_Accounts").map((r) => {
    const code = String(r.account_code), section = str(r.section) ?? "";
    const id = randomUUID(); accountId.set(code, id);
    return { id, farmId, code, label: str(r.account_name) ?? code, kind: kindForSection(section), scheduleFCode: DATASET_SCHEDULE_F[code] ?? "", section, statementLine: str(r.statement_line), cashFlowClass: str(r.cash_flow_class) };
  });
  await prisma.account.createMany({ data: accounts });
  counts.accounts = accounts.length;

  // ---------- enterprises ----------
  const enterpriseId = new Map<string, string>();
  const entRows = t("Enterprises");
  for (const r of entRows) enterpriseId.set(String(r.enterprise_id), randomUUID());
  await prisma.enterprise.createMany({
    data: entRows.map((r) => ({
      id: enterpriseId.get(String(r.enterprise_id))!, farmId, code: ent(String(r.enterprise_id)), externalId: String(r.enterprise_id),
      name: str(r.enterprise_name) ?? String(r.enterprise_id), type: str(r.enterprise_type), notes: str(r.notes),
      parentId: r.parent_enterprise_id ? enterpriseId.get(String(r.parent_enterprise_id)) ?? null : null,
    })),
  });
  const E = (v: Cell | undefined) => (v ? enterpriseId.get(String(v)) ?? null : null);
  counts.enterprises = entRows.length;

  // ---------- counterparties ----------
  const customerId = new Map<string, string>(), vendorId = new Map<string, string>(), names = new Map<string, string>();
  const customers = t("Customers").map((r) => {
    const id = randomUUID(); customerId.set(String(r.customer_id), id); names.set(String(r.customer_id), str(r.name) ?? "");
    return { id, farmId, externalId: String(r.customer_id), name: str(r.name) ?? String(r.customer_id), customerType: str(r.customer_type), paymentTermsDays: int(r.payment_terms_days), location: str(r.location), notes: str(r.notes) };
  });
  const vendors = t("Vendors").map((r) => {
    const id = randomUUID(); vendorId.set(String(r.vendor_id), id); names.set(String(r.vendor_id), str(r.name) ?? "");
    return { id, farmId, externalId: String(r.vendor_id), name: str(r.name) ?? String(r.vendor_id), category: str(r.category), paymentTermsDays: int(r.payment_terms_days), location: str(r.location), notes: str(r.notes) };
  });
  await prisma.customer.createMany({ data: customers });
  await prisma.vendor.createMany({ data: vendors });
  counts.customers = customers.length; counts.vendors = vendors.length;

  // ---------- loans ----------
  const liabilityId = new Map<string, string>();
  const loans = t("Loans").map((r) => {
    const id = randomUUID(); liabilityId.set(String(r.loan_id), id);
    const isLine = String(r.loan_id).startsWith("LOC");
    return {
      id, farmId, externalId: String(r.loan_id), type: LIABILITY_TYPE(str(r.debt_type)) as "MORTGAGE",
      name: str(r.purpose) ?? String(r.loan_id), lender: str(r.lender),
      originalCents: toCents(r.original_principal), balanceCents: toCents(r.principal_balance_at_cutoff),
      ratePct: Math.round((num(r.interest_rate) ?? 0) * 100_000) / 1000,
      nextPaymentAt: toDate(r.next_payment_date), paymentCents: centsOrNull(r.payment_amount), paymentFreq: FREQ(str(r.payment_frequency)),
      debtType: str(r.debt_type), purpose: str(r.purpose), collateral: str(r.collateral), rateType: str(r.rate_type),
      originatedAt: toDate(r.origination_date), firstPaymentAt: toDate(r.first_payment_date), maturityAt: toDate(r.maturity_date),
      numberOfPayments: int(r.number_of_payments), limitCents: isLine ? toCents(r.original_principal) : null,
    };
  });
  await prisma.liability.createMany({ data: loans });
  await prisma.loanScheduleEntry.createMany({
    data: t("Loan_Schedule").map((r) => ({
      liabilityId: req(liabilityId.get(String(r.loan_id)), `loan ${r.loan_id}`), number: req(int(r.payment_number), "payment_number"),
      dueDate: req(toDate(r.due_date), "due_date"), paymentCents: toCents(r.payment), interestCents: toCents(r.interest),
      principalCents: toCents(r.principal), endingBalanceCents: toCents(r.ending_balance), status: str(r.status) ?? "Scheduled",
    })),
  });
  counts.loans = loans.length; counts.loanSchedule = t("Loan_Schedule").length;

  // ---------- assets ----------
  const assetId = new Map<string, string>();
  const assets = t("Assets").map((r) => {
    const id = randomUUID(); assetId.set(String(r.asset_id), id);
    const repairs: Record<string, string> = {};
    for (const k of Object.keys(r)) { const m = /^repairs_(\d{4})/.exec(k); if (m && r[k] != null) repairs[m[1]!] = toCents(r[k]).toString(); }
    if (r.repairs_ttm != null) repairs.ttm = toCents(r.repairs_ttm).toString();
    return {
      id, farmId, externalId: String(r.asset_id), description: str(r.description) ?? String(r.asset_id), category: str(r.category) ?? "Other",
      enterpriseAllocation: str(r.enterprise_allocation), purchasedAt: req(toDate(r.purchase_date), "purchase_date"),
      originalCostCents: toCents(r.original_cost), financing: str(r.financing), liabilityId: r.loan_id ? liabilityId.get(String(r.loan_id)) ?? null : null,
      usefulLifeYears: int(r.useful_life_years), salvageCents: toCents(r.salvage_value), depreciationMethod: str(r.depreciation_method),
      estCurrentValueCents: centsOrNull(r.estimated_current_value), repairsByYear: repairs, usage: str(r.usage), maintenanceNotes: str(r.maintenance_notes),
      disposedAt: toDate(r.disposal_date), disposalProceedsCents: centsOrNull(r.disposal_proceeds), notes: str(r.notes), status: str(r.status) ?? "In service",
    };
  });
  await prisma.asset.createMany({ data: assets });
  await prisma.assetDepreciation.createMany({
    data: t("Depreciation").map((r) => ({ assetId: req(assetId.get(String(r.asset_id)), `asset ${r.asset_id}`), enterpriseId: E(r.enterprise_id), year: req(int(r.year), "year"), amountCents: toCents(r.depreciation) })),
  });
  counts.assets = assets.length;

  // ---------- AR / AP ----------
  const invoiceId = new Map<string, string>();
  const invoices = t("AR_Invoices").map((r) => {
    const id = randomUUID(); invoiceId.set(String(r.invoice_id), id);
    const paid = str(r.status) === "Paid";
    return {
      id, farmId, number: String(r.invoice_id), externalId: String(r.invoice_id), customerId: req(customerId.get(String(r.customer_id)), `customer ${r.customer_id}`),
      enterpriseId: E(r.enterprise_id), status: (paid ? "PAID" : "SENT") as "PAID", issuedAt: req(toDate(r.invoice_date), "invoice_date"),
      dueAt: toDate(r.due_date) ?? req(toDate(r.invoice_date), "invoice_date"), totalCents: toCents(r.amount), amountPaidCents: toCents(r.amount_paid),
      paidAt: toDate(r.paid_date), expectedPaymentAt: toDate(r.expected_payment_date), description: str(r.description),
    };
  });
  await prisma.invoice.createMany({ data: invoices });
  await prisma.invoiceLineItem.createMany({
    data: invoices.map((i) => ({ invoiceId: i.id, description: i.description ?? i.number, quantity: 1, unitCents: i.totalCents, amountCents: i.totalCents })),
  });
  const billId = new Map<string, string>();
  const bills = t("AP_Bills").map((r) => {
    const id = randomUUID(); billId.set(String(r.bill_id), id);
    return {
      id, farmId, number: String(r.bill_id), vendorId: req(vendorId.get(String(r.vendor_id)), `vendor ${r.vendor_id}`), enterpriseId: E(r.enterprise_id),
      billDate: req(toDate(r.bill_date), "bill_date"), dueDate: toDate(r.due_date) ?? req(toDate(r.bill_date), "bill_date"), category: str(r.expense_category),
      accountCode: str(r.account_code), description: str(r.description), amountCents: toCents(r.amount), amountPaidCents: toCents(r.amount_paid),
      status: str(r.status) === "Paid" ? "Paid" : "Open", paidAt: toDate(r.paid_date), expectedPaymentAt: toDate(r.expected_payment_date),
    };
  });
  await prisma.bill.createMany({ data: bills });
  counts.invoices = invoices.length; counts.bills = bills.length;

  // ---------- land, crops, animals ----------
  await prisma.landParcel.createMany({
    data: t("Land").map((r) => ({ farmId, externalId: str(r.parcel_id), name: str(r.parcel_name) ?? "Parcel", acres: num(r.acres) ?? 0, use: str(r.use), tenure: str(r.tenure), enterpriseId: E(r.enterprise_id) })),
  });
  const cropSeasonId = new Map<string, string>();
  const CROP_KNOWN = ["business_id", "crop_season_id", "enterprise_id", "crop", "field_id", "crop_year", "acres", "irrigated", "plant_date", "harvest_start", "harvest_end", "expected_yield", "actual_yield", "yield_unit", "total_production", "expected_price", "actual_avg_price", "qty_sold", "data_type"];
  const seasons = t("Crop_Seasons").map((r) => {
    const id = randomUUID(); cropSeasonId.set(String(r.crop_season_id), id);
    return {
      id, farmId, externalId: String(r.crop_season_id), enterpriseId: E(r.enterprise_id), crop: str(r.crop) ?? "", fieldId: str(r.field_id),
      year: req(int(r.crop_year), "crop_year"), acres: num(r.acres) ?? 0, irrigated: bool(r.irrigated), plantedAt: toDate(r.plant_date),
      harvestStart: toDate(r.harvest_start), harvestEnd: toDate(r.harvest_end), expectedYield: num(r.expected_yield), actualYield: num(r.actual_yield),
      yieldUnit: str(r.yield_unit), totalProduction: num(r.total_production), expectedPrice: num(r.expected_price), actualAvgPrice: num(r.actual_avg_price),
      qtySold: num(r.qty_sold), extra: extra(r, CROP_KNOWN), dataType: str(r.data_type),
    };
  });
  await prisma.cropSeason.createMany({ data: seasons });
  const PROD_KNOWN = ["business_id", "enterprise_id", "date", "record_type", "item", "quantity", "unit", "data_type", "record_id"];
  await prisma.productionRecord.createMany({
    data: t("Production_Log").map((r) => ({
      farmId, externalId: str(r.record_id), enterpriseId: E(r.enterprise_id), date: req(toDate(r.date), "date"), recordType: str(r.record_type) ?? "",
      item: str(r.item), quantity: num(r.quantity), unit: str(r.unit), extra: extra(r, PROD_KNOWN), dataType: str(r.data_type),
    })),
  });
  await prisma.weatherMonth.createMany({
    data: t("Weather").map((r) => ({ farmId, year: req(int(r.year), "year"), month: req(int(r.month), "month"), rainfallIn: num(r.rainfall_in) ?? 0, normalIn: num(r.normal_in) ?? 0, dataType: str(r.data_type), note: str(r.note) })),
  });
  const animalId = new Map<string, string>();
  const animals = t("Animals").map((r) => {
    const id = randomUUID(); animalId.set(String(r.animal_id), id);
    return {
      id, farmId, externalId: String(r.animal_id), species: str(r.species) ?? "", sex: str(r.sex), breed: str(r.breed), nameOrTag: str(r.name_or_tag),
      birthDate: toDate(r.birth_date), origin: str(r.origin), acquiredAt: toDate(r.acquired_date), damId: str(r.dam_id), sireId: str(r.sire_id),
      currentClass: str(r.current_class), status: str(r.status), dispositionDate: toDate(r.disposition_date), dispositionType: str(r.disposition_type),
      dispositionDetail: str(r.disposition_detail), weaningWeightLb: num(r.weaning_weight_lb), saleWeightLb: num(r.sale_or_live_weight_lb),
      salePriceCents: centsOrNull(r.sale_price), grade: str(r.grade), aiSired: bool(r.ai_sired),
    };
  });
  await prisma.animal.createMany({ data: animals });
  counts.animals = animals.length; counts.cropSeasons = seasons.length;
  await prisma.herdFlowMonth.createMany({
    data: t("Herd_Flow_Monthly").map((r) => ({
      farmId, monthEnd: req(toDate(r.month_end), "month_end"), species: str(r.species) ?? "", animalClass: str(r.animal_class) ?? "", category: str(r.category),
      opening: int(r.opening) ?? 0, births: int(r.births) ?? 0, purchases: int(r.purchases) ?? 0, transfersIn: int(r.transfers_in) ?? 0,
      transfersOut: int(r.transfers_out) ?? 0, deaths: int(r.deaths) ?? 0, cullsSold: int(r.culls_sold) ?? 0, sales: int(r.sales) ?? 0,
      processed: int(r.processed) ?? 0, householdUse: int(r.household_use) ?? 0, ending: int(r.ending) ?? 0,
    })),
  });
  await prisma.semenEvent.createMany({
    data: t("Semen_Log").map((r) => ({ farmId, date: req(toDate(r.date), "date"), bullId: str(r.bull_id) ?? "", event: str(r.event) ?? "", straws: int(r.straws) ?? 0, costCents: centsOrNull(r.cost), dataType: str(r.data_type) })),
  });
  await prisma.bullValuation.createMany({
    data: t("Prize_Bull_Values").map((r) => ({
      farmId, animalId: str(r.animal_id) ?? "", name: str(r.name), asOf: req(toDate(r.as_of_date), "as_of_date"), marketValueCents: toCents(r.estimated_market_value),
      insuredValueCents: centsOrNull(r.insured_value), ageYears: num(r.age_years), strawsOnHand: int(r.straws_on_hand), method: str(r.valuation_method),
    })),
  });
  await prisma.reproductionYear.createMany({ data: t("Reproduction").map((r) => ({ farmId, year: req(int(r.calving_year), "calving_year"), data: extra(r, ["business_id", "calving_year"]) })) });
  await prisma.processedAnimal.createMany({
    data: t("Processed_Animals").map((r) => ({
      farmId, animalId: str(r.animal_id) ?? "", enterpriseId: E(r.enterprise_id), species: str(r.species), processedAt: toDate(r.processing_date),
      revenueCents: centsOrNull(r.revenue), data: extra(r, ["business_id", "animal_id", "enterprise_id", "species"]),
    })),
  });

  // ---------- inventory snapshots, labor, transfers ----------
  await prisma.inventorySnapshot.createMany({
    data: t("Inventory").map((r) => ({
      farmId, asOf: req(toDate(r.as_of_date), "as_of_date"), itemKey: str(r.item_id) ?? "", item: str(r.item) ?? "", category: str(r.category) ?? "",
      enterpriseId: E(r.enterprise_id), quantity: num(r.quantity) ?? 0, unit: str(r.unit), costPerUnit: num(r.cost_basis_per_unit), marketPerUnit: num(r.market_value_per_unit),
      costBasisCents: toCents(r.cost_basis_total), marketValueCents: toCents(r.market_value_total), bsValuation: str(r.bs_valuation) ?? "market",
      acquiredOrProduced: str(r.acquired_or_produced), expectedUseOrSale: str(r.expected_use_or_sale), location: str(r.location),
    })),
  });
  await prisma.laborEntry.createMany({
    data: t("Labor_Hours").map((r) => ({
      farmId, month: req(toDate(r.month), "month"), enterpriseId: E(r.enterprise_id), workerType: str(r.worker_type) ?? "", worker: str(r.worker),
      hours: num(r.hours) ?? 0, hourlyCostCents: centsOrNull(r.hourly_cost), wagesPaidCents: toCents(r.wages_paid), note: str(r.note),
    })),
  });
  await prisma.enterpriseTransfer.createMany({
    data: t("Enterprise_Transfers").map((r) => ({
      farmId, externalId: str(r.transfer_id), date: req(toDate(r.date), "date"), fromEnterpriseId: req(E(r.from_enterprise_id), "from"), toEnterpriseId: req(E(r.to_enterprise_id), "to"),
      amountCents: toCents(r.amount), head: int(r.head), animalClass: str(r.animal_class), description: str(r.description),
    })),
  });

  // ---------- ledger ----------
  const nameFor = (cp: Cell | undefined) => (cp ? names.get(String(cp)) ?? null : null);
  const ledger = t("Transactions").map((r) => {
    const code = String(r.account_code), section = str(r.section) ?? "";
    const amount = toCents(r.amount), cash = centsOrNull(r.cash_effect);
    const cp = str(r.counterparty_id);
    return {
      farmId, externalId: str(r.txn_id), source: "testfarm", entryType: "ledger",
      date: req(toDate(r.txn_date), "txn_date"), cashDate: toDate(r.cash_date), expectedCashDate: toDate(r.expected_cash_date), dueDate: toDate(r.due_date),
      // P&L rows: + increases income. Balance-sheet flows carry their cash sign.
      amountCents: section === "CASHBS" ? (cash ?? 0n) : amount * (SIGN[section] ?? 1n),
      cashEffectCents: r.cash_date ? cash : null,
      accountId: req(accountId.get(code), `account ${code}`), description: str(r.description) ?? "",
      enterpriseId: E(r.enterprise_id), vendor: nameFor(cp),
      vendorId: cp?.startsWith("VEN-") ? vendorId.get(cp) ?? null : null, customerId: cp?.startsWith("CUS-") ? customerId.get(cp) ?? null : null,
      invoiceId: r.invoice_id ? invoiceId.get(String(r.invoice_id)) ?? null : null, billId: r.bill_id ? billId.get(String(r.bill_id)) ?? null : null,
      assetId: r.asset_id ? assetId.get(String(r.asset_id)) ?? null : null, liabilityId: r.loan_id ? liabilityId.get(String(r.loan_id)) ?? null : null,
      cropSeasonId: r.crop_season_id ? cropSeasonId.get(String(r.crop_season_id)) ?? null : null, animalId: r.animal_id ? animalId.get(String(r.animal_id)) ?? null : null,
      quantity: num(r.quantity), unit: str(r.unit), unitPrice: num(r.unit_price), paymentMethod: str(r.payment_method),
    };
  });
  // Month-end non-cash adjustments (depreciation, inventory & livestock value changes,
  // internal transfers, gains) come from the income-statement detail.
  const adjustments = t("IS_Detail").filter((r) => ADJUSTMENT_SECTIONS.has(String(r.section))).map((r) => ({
    farmId, source: "testfarm", entryType: "adjustment", date: req(toDate(r.month_end), "month_end"), cashDate: null, cashEffectCents: null,
    amountCents: toCents(r.amount), accountId: req(accountId.get(String(r.account_code)), `account ${r.account_code}`),
    description: `${str(r.line_item) ?? str(r.account_name)} (month-end)`, enterpriseId: E(r.enterprise_id),
  }));
  for (let i = 0; i < ledger.length; i += 2000) await prisma.transaction.createMany({ data: ledger.slice(i, i + 2000) });
  for (let i = 0; i < adjustments.length; i += 2000) await prisma.transaction.createMany({ data: adjustments.slice(i, i + 2000) });
  counts.transactions = ledger.length; counts.adjustments = adjustments.length;

  // ---------- opening balances (12/31/2022) ----------
  const bs = new Map(t("BS_Monthly").map((r) => [String(r["Line item"]), r]));
  const bsHead = Object.keys(t("BS_Monthly")[0] ?? {}).filter((k) => k !== "Line item");
  const openCol = bsHead[0]!;
  const opening = (line: string) => toCents(bs.get(line)?.[openCol] ?? 0);
  const landMarket = assets.filter((a) => a.category === "Land").reduce((s, a) => s + (a.estCurrentValueCents ?? a.originalCostCents), 0n);
  await prisma.openingBalance.createMany({
    data: [
      { farmId, asOf: req(toDate(openCol), "opening date"), line: "cash", amountCents: opening("Cash") },
      { farmId, asOf: req(toDate(openCol), "opening date"), line: "contributed_capital", amountCents: opening("Owner contributed capital") },
      { farmId, asOf: req(toDate(openCol), "opening date"), line: "retained_earnings", amountCents: opening("Retained earnings") },
      { farmId, asOf: req(toDate(openCol), "opening date"), line: "operating_line", amountCents: opening("Operating line") },
      { farmId, asOf: CUTOFF, line: "land_market_value", amountCents: landMarket },
    ],
  });

  // Land market value memo, every month-end.
  const landMemo = bs.get("memo: land at market value");
  if (landMemo) {
    await prisma.landValuation.createMany({
      data: bsHead.map((k) => ({ farmId, asOf: req(toDate(k), "month"), marketValueCents: toCents(landMemo[k]), source: "dataset" })),
    });
  }

  // Unit bases for per-head economics (cows calving, hogs processed, straws sold, ...).
  await prisma.enterpriseUnitCount.createMany({
    data: t("Unit_Econ_Livestock").filter((r) => E(r.enterprise_id)).map((r) => ({
      farmId, enterpriseId: E(r.enterprise_id)!, year: req(int(r.year), "year"), basis: str(r.head_basis) ?? "Head", count: int(r.head_count) ?? 0,
    })),
    skipDuplicates: true,
  });

  // Marketing contracts named in the forecast assumptions, e.g.
  // "Forward contract #FC-2611: 4,000 bu soybeans @ $10.45, Nov-2026 delivery".
  const MONTH = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  for (const r of t("Forecast_Assumptions")) {
    const m = String(r.assumption ?? "").match(/(forward|hta|basis) contract #?([\w-]+):\s*([\d,.]+)\s*(\w+)\s+([a-z]+)\s*@\s*\$([\d.]+),?\s*([a-z]{3})-(\d{4}) delivery/i);
    if (!m) continue;
    const [, kind, number, qty, unit, commodity, price, mon, yr] = m;
    const mi = MONTH.indexOf(mon!.toLowerCase());
    await prisma.marketingContract.create({ data: {
      farmId, externalId: number, number, commodity: commodity![0]!.toUpperCase() + commodity!.slice(1).toLowerCase(), cropYear: Number(yr),
      type: kind!.toLowerCase(), quantity: Number(qty!.replace(/,/g, "")), unit: unit!.toLowerCase(), price: Number(price),
      deliveryStart: new Date(Date.UTC(Number(yr), mi, 1)), deliveryEnd: new Date(Date.UTC(Number(yr), mi + 1, 0)),
      notes: str(r.source_or_note) ?? undefined,
    } });
  }

  // ---------- plans, assumptions, references ----------
  await prisma.enterpriseBudget.createMany({
    data: t("Budget_vs_Actual").map((r) => ({
      farmId, year: req(int(r.year), "year"), period: str(r.period) ?? "Full year", enterpriseId: r.enterprise_id === "TOTAL" ? null : E(r.enterprise_id),
      plannedRevenueCents: toCents(r.planned_revenue), plannedExpensesCents: toCents(r.planned_expenses), plannedNetIncomeCents: toCents(r.planned_net_income),
    })),
  });
  await prisma.budgetMonth.createMany({
    data: t("Budget_Monthly").map((r) => ({
      farmId, monthEnd: req(toDate(r.month_end), "month_end"), revenueCents: toCents(r.revenue), copCents: toCents(r.cost_of_production),
      overheadCents: toCents(r.overhead), depreciationCents: toCents(r.depreciation), interestCents: toCents(r.interest),
    })),
  });
  await prisma.forecastAssumption.createMany({
    data: t("Forecast_Assumptions").map((r) => ({ farmId, scenario: str(r.scenario) ?? "Base", driver: str(r.driver) ?? "", assumption: str(r.assumption) ?? "", note: str(r.source_or_note) })),
  });
  await prisma.scenarioLever.createMany({
    data: t("Scenario_Levers").map((r) => ({
      farmId, externalId: str(r.lever_id), question: str(r.decision_question) ?? "", driver: str(r.driver) ?? "", baseValue: str(r.base_value),
      scenarioChange: str(r.scenario_change), estimatedImpact: num(r.estimated_annual_impact), impactUnit: str(r.impact_unit), basis: str(r.calculation_basis),
      template: DATASET_LEVERS[String(r.lever_id)]?.template ?? "manual",
      params: (DATASET_LEVERS[String(r.lever_id)]?.params ?? { impact: num(r.estimated_annual_impact), basis: str(r.calculation_basis) }) as Prisma.InputJsonObject,
    })),
  });
  await prisma.insightReference.createMany({
    data: t("AI_Insights").map((r) => {
      let keyMetrics: Prisma.InputJsonValue | undefined;
      try { keyMetrics = r.key_metrics ? JSON.parse(String(r.key_metrics)) : undefined; } catch { keyMetrics = String(r.key_metrics); }
      return { farmId, externalId: str(r.insight_id) ?? "", severity: str(r.severity) ?? "Watch", category: str(r.category), title: str(r.title) ?? "", finding: str(r.finding), recommendation: str(r.recommendation), keyMetrics, sourceTables: str(r.source_tables) };
    }),
  });
  for (const year of [2023, 2024, 2025, 2026]) {
    await prisma.accountingPeriod.create({ data: { farmId, year, locked: year < 2026, lockedAt: year < 2026 ? new Date(Date.UTC(year + 1, 3, 15)) : null } });
  }
  return { farmId, name: farm.name, counts };
}
