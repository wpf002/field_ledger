/**
 * Accrual financial statements (Roadmap 2, Phases 10-11). Pure functions over
 * integer cents. The ledger carries two dates per row: `date` (earned/incurred)
 * and `cashDate` (cash moved; null = still open). Working-capital balances fall
 * out of the gap between the two:
 *   revenue earned, not collected      -> accounts receivable
 *   revenue collected, not yet earned  -> customer deposits
 *   cost incurred, not paid            -> AP / credit cards / accrued taxes
 *   cost paid, not yet incurred        -> prepaid expenses
 */

export type StatementRow = {
  date: Date;
  cashDate: Date | null;
  amountCents: bigint;        // P&L sign: + increases income. Balance-sheet flows: cash sign.
  cashEffectCents: bigint | null;
  section: string;            // REV COP OVH INT DEP GAIN INVCHG LVCHG XFER CASHBS
  accountCode: string;
  paymentMethod?: string | null;
  enterpriseId?: string | null;
};

export type InventorySnap = { asOf: Date; category: string; bsValuation: string; costBasisCents: bigint; marketValueCents: bigint };
export type AssetRec = { category: string; purchasedAt: Date; originalCostCents: bigint; salvageCents: bigint; usefulLifeYears: number | null; disposedAt: Date | null; estCurrentValueCents?: bigint | null };
export type LoanRec = {
  id: string; debtType: string | null; isLine: boolean; originatedAt: Date | null; originalCents: bigint;
  schedule: { dueDate: Date; principalCents: bigint; endingBalanceCents: bigint }[];
};
export type Opening = { asOf: Date; cashCents: bigint; contributedCents: bigint; retainedCents: bigint; operatingLineCents: bigint; landMarketCents?: bigint };

const t = (d: Date) => d.getTime();
const sum = (xs: bigint[]) => xs.reduce((s, x) => s + x, 0n);

// ---------- income statement ----------
export type IncomeStatement = {
  revenueCents: bigint; copCents: bigint; grossProfitCents: bigint; grossMarginPct: number | null;
  overheadCents: bigint; ebitdaCents: bigint; depreciationCents: bigint; operatingProfitCents: bigint;
  interestCents: bigint; gainCents: bigint; netIncomeOperatingCents: bigint;
  inventoryChangeCents: bigint; livestockChangeCents: bigint; netFarmIncomeCents: bigint;
  transfersCents: bigint;
};

/** Income statement for rows with from < date <= to (accrual basis). Costs are reported positive. */
export function incomeStatement(rows: StatementRow[], from: Date, to: Date): IncomeStatement {
  const by: Record<string, bigint> = {};
  for (const r of rows) {
    if (t(r.date) <= t(from) || t(r.date) > t(to)) continue;
    by[r.section] = (by[r.section] ?? 0n) + r.amountCents;
  }
  const g = (s: string) => by[s] ?? 0n;
  const revenueCents = g("REV"), copCents = -g("COP"), overheadCents = -g("OVH"), depreciationCents = -g("DEP"), interestCents = -g("INT");
  const grossProfitCents = revenueCents - copCents;
  const ebitdaCents = grossProfitCents - overheadCents;
  const operatingProfitCents = ebitdaCents - depreciationCents;
  const gainCents = g("GAIN");
  const netIncomeOperatingCents = operatingProfitCents - interestCents + gainCents;
  const inventoryChangeCents = g("INVCHG"), livestockChangeCents = g("LVCHG");
  return {
    revenueCents, copCents, grossProfitCents, grossMarginPct: revenueCents === 0n ? null : Number(grossProfitCents) / Number(revenueCents),
    overheadCents, ebitdaCents, depreciationCents, operatingProfitCents, interestCents, gainCents, netIncomeOperatingCents,
    inventoryChangeCents, livestockChangeCents, netFarmIncomeCents: netIncomeOperatingCents + inventoryChangeCents + livestockChangeCents,
    transfersCents: g("XFER"),
  };
}

// ---------- fixed assets ----------
const monthIndex = (d: Date) => d.getUTCFullYear() * 12 + d.getUTCMonth();

/** Straight-line monthly depreciation; the purchase month counts as a full month. */
export function accumulatedDepreciation(a: AssetRec, at: Date): bigint {
  if (a.category === "Land" || !a.usefulLifeYears || t(a.purchasedAt) > t(at)) return 0n;
  return a.originalCostCents - exactNbv(a, at);
}
export function netBookValue(a: AssetRec, at: Date): bigint {
  if (t(a.purchasedAt) > t(at) || (a.disposedAt && t(a.disposedAt) <= t(at))) return 0n;
  return exactNbv(a, at);
}

const halfEven = (num: bigint, den: bigint): bigint => {
  const q = num / den, r = num % den;
  if (r * 2n > den || (r * 2n === den && q % 2n !== 0n)) return q + 1n;
  return q;
};

/**
 * Net book value by balance-sheet line. Each asset's book value is computed
 * exactly (cost - base * months / life-months) and rounded to the cent
 * half-to-even before summing.
 */
export function fixedAssetLines(assets: AssetRec[], at: Date) {
  const out = { land: 0n, vehicles: 0n, buildings: 0n, machinery: 0n };
  for (const a of assets) {
    if (t(a.purchasedAt) > t(at) || (a.disposedAt && t(a.disposedAt) <= t(at))) continue;
    const key = a.category === "Land" ? "land" : a.category === "Vehicles" ? "vehicles" : a.category === "Buildings & improvements" ? "buildings" : "machinery";
    out[key] += exactNbv(a, at);
  }
  return out;
}

function exactNbv(a: AssetRec, at: Date): bigint {
  if (!a.usefulLifeYears || a.category === "Land") return a.originalCostCents;
  const L = BigInt(a.usefulLifeYears * 12);
  const n = BigInt(monthIndex(at) - monthIndex(a.purchasedAt) + 1);
  const base = a.originalCostCents - a.salvageCents;
  if (n >= L) return a.salvageCents;
  return halfEven(a.originalCostCents * L - base * n, L);
}

// ---------- loans ----------
export function loanBalance(l: LoanRec, at: Date): bigint {
  if (l.originatedAt && t(l.originatedAt) > t(at)) return 0n;
  let bal = l.originalCents;
  for (const s of l.schedule) if (t(s.dueDate) <= t(at)) bal = s.endingBalanceCents;
  return bal;
}
/** Principal due within 365 days after `at`. */
export function currentPortion(l: LoanRec, at: Date): bigint {
  if (l.originatedAt && t(l.originatedAt) > t(at)) return 0n;
  const end = t(at) + 365 * 86_400_000;
  return sum(l.schedule.filter((s) => t(s.dueDate) > t(at) && t(s.dueDate) <= end).map((s) => s.principalCents));
}

// ---------- balance sheet ----------
export const INVENTORY_LINE: Record<string, keyof BalanceSheet> = {
  "Feed - hay": "feedCents", "Crops - hay": "cropInventoryCents", "Crops - grain": "cropInventoryCents",
  "Growing crops": "growingCropsCents", "Semen inventory": "suppliesCents", "Packaged meat": "suppliesCents",
  "Livestock - market": "marketLivestockCents", "Livestock - breeding": "breedingLivestockCents",
};
const CREDIT_CARD = new Set(["Credit card", "Card"]);
const DEBT_LINE = (debtType: string | null): "landLoansCents" | "equipmentLoansCents" | "vehicleLoansCents" | "otherTermDebtCents" =>
  debtType === "Land loan" ? "landLoansCents" : debtType === "Equipment loan" ? "equipmentLoansCents" : debtType === "Vehicle loan" ? "vehicleLoansCents" : "otherTermDebtCents";

export type BalanceSheet = {
  asOf: Date;
  cashCents: bigint; arCents: bigint; prepaidCents: bigint; cropInventoryCents: bigint; feedCents: bigint; growingCropsCents: bigint;
  suppliesCents: bigint; marketLivestockCents: bigint; totalCurrentAssetsCents: bigint;
  breedingLivestockCents: bigint; machineryCents: bigint; vehiclesCents: bigint; buildingsCents: bigint; landCents: bigint;
  totalNonCurrentAssetsCents: bigint; totalAssetsCents: bigint;
  apCents: bigint; creditCardsCents: bigint; accruedPropertyTaxCents: bigint; accruedPayrollTaxCents: bigint; customerDepositsCents: bigint;
  operatingLineCents: bigint; currentPortionCents: bigint; totalCurrentLiabilitiesCents: bigint;
  landLoansCents: bigint; equipmentLoansCents: bigint; vehicleLoansCents: bigint; otherTermDebtCents: bigint;
  totalLiabilitiesCents: bigint; contributedCents: bigint; retainedCents: bigint; totalEquityCents: bigint;
  balanceCheckCents: bigint; landMarketCents: bigint; marketNetWorthCents: bigint;
};

export type BalanceSheetInputs = { rows: StatementRow[]; inventory: InventorySnap[]; assets: AssetRec[]; loans: LoanRec[]; opening: Opening };

export function balanceSheetAt(inp: BalanceSheetInputs, at: Date): BalanceSheet {
  const m = t(at), open = t(inp.opening.asOf);
  const bs = { asOf: at } as BalanceSheet;
  for (const k of Object.keys(emptyLines)) (bs as Record<string, unknown>)[k] = 0n;

  let cash = inp.opening.cashCents, contributed = inp.opening.contributedCents, retained = inp.opening.retainedCents;
  for (const r of inp.rows) {
    const d = t(r.date), c = r.cashDate ? t(r.cashDate) : null;
    if (c != null && c > open && c <= m && r.cashEffectCents != null) {
      cash += r.cashEffectCents;
      if (r.accountCode === "8040") contributed += r.cashEffectCents;
    }
    if (r.section === "CASHBS") {
      // owner distributions and owner income-tax payments reduce retained earnings (negative cash sign)
      if ((r.accountCode === "8041" || r.accountCode === "8042") && d > open && d <= m) retained += r.amountCents;
      continue;
    }
    if (d > open && d <= m) retained += r.amountCents;
    if (r.section === "REV") {
      if (d <= m && (c == null || c > m)) bs.arCents += r.amountCents;
      if (c != null && c <= m && d > m) bs.customerDepositsCents += r.amountCents;
    } else if (r.section === "COP" || r.section === "OVH" || r.section === "INT") {
      const cost = -r.amountCents;
      if (d <= m && (c == null || c > m)) {
        if (r.accountCode === "6020") bs.accruedPropertyTaxCents += cost;
        else if (r.accountCode === "5131") bs.accruedPayrollTaxCents += cost;
        else if (r.paymentMethod && CREDIT_CARD.has(r.paymentMethod)) bs.creditCardsCents += cost;
        else bs.apCents += cost;
      }
      if (c != null && c <= m && d > m) bs.prepaidCents += cost;
    }
  }
  bs.cashCents = cash;
  bs.operatingLineCents = operatingLineBalance(inp.rows, inp.opening, at);

  for (const s of inp.inventory) {
    if (t(s.asOf) !== m) continue;
    const key = INVENTORY_LINE[s.category];
    if (key) (bs[key] as bigint) += s.bsValuation === "cost" ? s.costBasisCents : s.marketValueCents;
  }
  const fixed = fixedAssetLines(inp.assets, at);
  bs.landCents = fixed.land; bs.vehiclesCents = fixed.vehicles; bs.buildingsCents = fixed.buildings; bs.machineryCents = fixed.machinery;
  for (const l of inp.loans) {
    if (l.isLine) continue;
    const bal = loanBalance(l, at), cur = currentPortion(l, at);
    bs.currentPortionCents += cur;
    bs[DEBT_LINE(l.debtType)] += bal - cur;
  }
  bs.contributedCents = contributed;
  bs.retainedCents = retained;

  bs.totalCurrentAssetsCents = bs.cashCents + bs.arCents + bs.prepaidCents + bs.cropInventoryCents + bs.feedCents + bs.growingCropsCents + bs.suppliesCents + bs.marketLivestockCents;
  bs.totalNonCurrentAssetsCents = bs.breedingLivestockCents + bs.machineryCents + bs.vehiclesCents + bs.buildingsCents + bs.landCents;
  bs.totalAssetsCents = bs.totalCurrentAssetsCents + bs.totalNonCurrentAssetsCents;
  bs.totalCurrentLiabilitiesCents = bs.apCents + bs.creditCardsCents + bs.accruedPropertyTaxCents + bs.accruedPayrollTaxCents + bs.customerDepositsCents + bs.operatingLineCents + bs.currentPortionCents;
  bs.totalLiabilitiesCents = bs.totalCurrentLiabilitiesCents + bs.landLoansCents + bs.equipmentLoansCents + bs.vehicleLoansCents + bs.otherTermDebtCents;
  bs.totalEquityCents = bs.contributedCents + bs.retainedCents;
  bs.balanceCheckCents = bs.totalAssetsCents - bs.totalLiabilitiesCents - bs.totalEquityCents;
  const landMarket = sum(inp.assets.filter((a) => a.category === "Land" && t(a.purchasedAt) <= m).map((a) => a.estCurrentValueCents ?? a.originalCostCents));
  bs.landMarketCents = landMarket;
  bs.marketNetWorthCents = bs.totalEquityCents + landMarket - bs.landCents;
  return bs;
}

const emptyLines = {
  cashCents: 0, arCents: 0, prepaidCents: 0, cropInventoryCents: 0, feedCents: 0, growingCropsCents: 0, suppliesCents: 0, marketLivestockCents: 0,
  totalCurrentAssetsCents: 0, breedingLivestockCents: 0, machineryCents: 0, vehiclesCents: 0, buildingsCents: 0, landCents: 0, totalNonCurrentAssetsCents: 0,
  totalAssetsCents: 0, apCents: 0, creditCardsCents: 0, accruedPropertyTaxCents: 0, accruedPayrollTaxCents: 0, customerDepositsCents: 0, operatingLineCents: 0,
  currentPortionCents: 0, totalCurrentLiabilitiesCents: 0, landLoansCents: 0, equipmentLoansCents: 0, vehicleLoansCents: 0, otherTermDebtCents: 0,
  totalLiabilitiesCents: 0, contributedCents: 0, retainedCents: 0, totalEquityCents: 0, balanceCheckCents: 0, landMarketCents: 0, marketNetWorthCents: 0,
};

/** Operating line balance: opening + draws - repayments (by cash date). */
export function operatingLineBalance(rows: StatementRow[], opening: Opening, at: Date): bigint {
  let bal = opening.operatingLineCents;
  for (const r of rows) {
    if (!r.cashDate || r.cashEffectCents == null || t(r.cashDate) <= t(opening.asOf) || t(r.cashDate) > t(at)) continue;
    if (r.accountCode === "8020") bal += r.cashEffectCents;      // draw: + cash, + debt
    else if (r.accountCode === "8021") bal += r.cashEffectCents; // repayment: - cash, - debt
  }
  return bal;
}

/** Month-ends from `from` through `to`, inclusive (UTC). */
export function monthEnds(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  let y = from.getUTCFullYear(), mo = from.getUTCMonth();
  for (;;) {
    const d = new Date(Date.UTC(y, mo + 1, 0));
    if (t(d) > t(to)) break;
    if (t(d) >= t(from)) out.push(d);
    mo++; if (mo === 12) { mo = 0; y++; }
  }
  return out;
}
