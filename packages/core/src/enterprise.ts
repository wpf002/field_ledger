/**
 * Enterprise and unit economics (Roadmap 2, Phase 13): P&L by enterprise, crop
 * profit per acre, livestock profit per head, break-even, and exposure math.
 * Integer cents throughout; per-unit figures are returned as cents (bigint) or
 * plain numbers where they are physical quantities.
 */
import type { StatementRow, IncomeStatement } from "./statements.js";

const t = (d: Date) => d.getTime();
const inRange = (d: Date, from: Date, to: Date) => t(d) > t(from) && t(d) <= t(to);

// ---------- enterprise P&L ----------
export type EnterpriseStatement = IncomeStatement & { enterpriseId: string | null };

/** Income statement per enterprise; internal transfers count toward each enterprise's gross profit. */
export function enterpriseStatements(rows: StatementRow[], from: Date, to: Date): Map<string | null, EnterpriseStatement> {
  const by = new Map<string | null, Record<string, bigint>>();
  for (const r of rows) {
    if (r.section === "CASHBS" || !inRange(r.date, from, to)) continue;
    const k = r.enterpriseId ?? null;
    const m = by.get(k) ?? {};
    m[r.section] = (m[r.section] ?? 0n) + r.amountCents;
    by.set(k, m);
  }
  const out = new Map<string | null, EnterpriseStatement>();
  for (const [k, g] of by) out.set(k, { ...fromSections(g), enterpriseId: k });
  return out;
}

export function fromSections(g: Record<string, bigint>): IncomeStatement {
  const v = (s: string) => g[s] ?? 0n;
  const revenueCents = v("REV"), transfersCents = v("XFER"), copCents = -v("COP"), overheadCents = -v("OVH");
  const depreciationCents = -v("DEP"), interestCents = -v("INT"), gainCents = v("GAIN");
  const grossProfitCents = revenueCents + transfersCents - copCents;
  const ebitdaCents = grossProfitCents - overheadCents;
  const operatingProfitCents = ebitdaCents - depreciationCents;
  const netIncomeOperatingCents = operatingProfitCents - interestCents + gainCents;
  const inventoryChangeCents = v("INVCHG"), livestockChangeCents = v("LVCHG");
  return {
    revenueCents, copCents, grossProfitCents, grossMarginPct: revenueCents === 0n ? null : Number(grossProfitCents) / Number(revenueCents),
    overheadCents, ebitdaCents, depreciationCents, operatingProfitCents, interestCents, gainCents, netIncomeOperatingCents,
    inventoryChangeCents, livestockChangeCents, netFarmIncomeCents: netIncomeOperatingCents + inventoryChangeCents + livestockChangeCents, transfersCents,
  };
}

// ---------- crop economics per acre ----------
export const CROP_COST_CATEGORY: Record<string, CropCostKey> = {
  "5010": "seed", "5020": "fertilizer", "5030": "chemical", "5140": "fuel", "5050": "contractor", "5055": "contractor", "5060": "contractor",
  "5160": "irrigation", "5150": "repairs", "5040": "cropInsurance",
};
export type CropCostKey = "seed" | "fertilizer" | "chemical" | "fuel" | "contractor" | "irrigation" | "repairs" | "cropInsurance" | "otherDirect";
export const CROP_COST_KEYS: CropCostKey[] = ["seed", "fertilizer", "chemical", "fuel", "contractor", "irrigation", "repairs", "cropInsurance", "otherDirect"];

export type CropSeasonRec = {
  id: string; enterpriseId: string | null; parentEnterpriseId: string | null; crop: string; year: number; acres: number;
  actualYield: number | null; actualAvgPrice: number | null; yieldUnit: string | null; qtyStoredEnd?: number | null;
};
export type CropEconomics = {
  season: CropSeasonRec;
  revenueCents: bigint; insuranceGovtCents: bigint; unsoldInventoryCents: bigint;
  costs: Record<CropCostKey, bigint>; directCostCents: bigint; depreciationCents: bigint; sharedCostCents: bigint; totalCostCents: bigint; profitCents: bigint;
  perAcre: { revenue: number; direct: number; depreciation: number; shared: number; total: number; profit: number } & Record<CropCostKey, number>;
  breakEvenYield: number | null; breakEvenPrice: number | null; breakEvenRevenuePerAcre: number;
};

/**
 * Per-acre economics for each crop season. Costs come from rows tagged to the season;
 * farms that don't tag seasons fall back to the season's enterprise for its crop year.
 * Enterprise depreciation is spread across that enterprise's acres; costs booked to a
 * parent enterprise (shared produce costs) are spread across all child crops by acres.
 */
export function cropEconomics(rows: StatementRow[], seasons: CropSeasonRec[], depreciationByEnterpriseYear: Map<string, bigint>): CropEconomics[] {
  const tagged = rows.some((r) => r.cropSeasonId);
  const acresBy = (key: (s: CropSeasonRec) => string | null, k: string) => seasons.filter((s) => key(s) === k).reduce((a, s) => a + s.acres, 0);
  const parentShared = new Map<string, bigint>();
  for (const r of rows) {
    if (r.entryType === "adjustment" && r.section !== "DEP") continue;
    if (!r.enterpriseId || !["COP", "OVH", "DEP"].includes(r.section)) continue;
    const k = `${r.enterpriseId}|${r.date.getUTCFullYear()}`;
    parentShared.set(k, (parentShared.get(k) ?? 0n) - r.amountCents);
  }
  return seasons.map((s) => {
    const costs = Object.fromEntries(CROP_COST_KEYS.map((k) => [k, 0n])) as Record<CropCostKey, bigint>;
    let revenue = 0n, insurance = 0n;
    for (const r of rows) {
      if (r.entryType === "adjustment") continue;
      const hit = tagged ? r.cropSeasonId === s.id : r.enterpriseId === s.enterpriseId && r.date.getUTCFullYear() === s.year;
      if (!hit) continue;
      if (r.section === "REV") { if (r.accountCode === "4200" || r.accountCode === "4210") insurance += r.amountCents; else revenue += r.amountCents; }
      else if (r.section === "COP") costs[CROP_COST_CATEGORY[r.accountCode] ?? "otherDirect"] -= r.amountCents;
    }
    const direct = CROP_COST_KEYS.reduce((a, k) => a + costs[k], 0n);
    const entAcres = s.enterpriseId ? acresBy((x) => (x.year === s.year ? x.enterpriseId : null), s.enterpriseId) : 0;
    const dep = s.enterpriseId && entAcres ? scaleCents(depreciationByEnterpriseYear.get(`${s.enterpriseId}|${s.year}`) ?? 0n, s.acres / entAcres) : 0n;
    const parentAcres = s.parentEnterpriseId ? acresBy((x) => (x.year === s.year ? x.parentEnterpriseId : null), s.parentEnterpriseId) : 0;
    const shared = s.parentEnterpriseId && parentAcres ? scaleCents(parentShared.get(`${s.parentEnterpriseId}|${s.year}`) ?? 0n, s.acres / parentAcres) : 0n;
    const unsold = s.qtyStoredEnd && s.actualAvgPrice ? BigInt(Math.round(s.qtyStoredEnd * s.actualAvgPrice * 100)) : 0n;
    const totalRevenue = revenue + unsold + insurance;
    const total = direct + dep + shared;
    const pa = (c: bigint) => (s.acres ? Number(c) / 100 / s.acres : 0);
    const perAcre = { revenue: pa(totalRevenue), direct: pa(direct), depreciation: pa(dep), shared: pa(shared), total: pa(total), profit: pa(totalRevenue - total), ...Object.fromEntries(CROP_COST_KEYS.map((k) => [k, pa(costs[k])])) } as CropEconomics["perAcre"];
    return {
      season: s, revenueCents: revenue, insuranceGovtCents: insurance, unsoldInventoryCents: unsold, costs, directCostCents: direct,
      depreciationCents: dep, sharedCostCents: shared, totalCostCents: total, profitCents: totalRevenue - total, perAcre,
      breakEvenYield: s.actualAvgPrice ? perAcre.total / s.actualAvgPrice : null,
      breakEvenPrice: s.actualYield ? perAcre.total / s.actualYield : null,
      breakEvenRevenuePerAcre: perAcre.total,
    };
  });
}
const scaleCents = (c: bigint, f: number) => BigInt(Math.round(Number(c) * f));

/** "Wheat needs 43 bu/ac at $6.00 or $5.38 at 48 bu/ac." Yield needed at a price, price needed at a yield. */
export const yieldNeeded = (costPerAcre: number, price: number) => (price > 0 ? costPerAcre / price : null);
export const priceNeeded = (costPerAcre: number, yieldPerAcre: number) => (yieldPerAcre > 0 ? costPerAcre / yieldPerAcre : null);

// ---------- livestock economics per head ----------
export type HeadCostKey = "animalCostTransfersIn" | "feed" | "vet" | "breedingGenetics" | "processing" | "labor" | "otherDirect" | "overheadDepInterest";
export const HEAD_COST_KEYS: HeadCostKey[] = ["animalCostTransfersIn", "feed", "vet", "breedingGenetics", "processing", "labor", "otherDirect", "overheadDepInterest"];
const HEAD_CATEGORY: Record<string, HeadCostKey> = {
  "5070": "feed", "5071": "feed", "5072": "feed", "5080": "vet", "5081": "breedingGenetics", "5082": "breedingGenetics",
  "5120": "breedingGenetics", "5121": "breedingGenetics", "5100": "processing", "5210": "processing", "5130": "labor", "5131": "labor",
};
export type HeadEconomics = {
  enterpriseId: string; headCount: number; basis: string | null;
  revenueInclTransfersCents: bigint; costs: Record<HeadCostKey, bigint>; totalCostCents: bigint; valueChangeCents: bigint;
  perHead: { revenue: number; total: number; profitBeforeInventory: number; valueChange: number; profitAccrual: number } & Record<HeadCostKey, number>;
};

/** Per-head (or per-unit, e.g. per straw) economics for one livestock enterprise over a period. */
export function headEconomics(rows: StatementRow[], enterpriseId: string, from: Date, to: Date, headCount: number, basis: string | null = null): HeadEconomics {
  const costs = Object.fromEntries(HEAD_COST_KEYS.map((k) => [k, 0n])) as Record<HeadCostKey, bigint>;
  let revenue = 0n, valueChange = 0n;
  for (const r of rows) {
    if (r.enterpriseId !== enterpriseId || !inRange(r.date, from, to)) continue;
    const a = r.amountCents;
    if (r.section === "REV") revenue += a;
    else if (r.section === "XFER") { if (a > 0n) revenue += a; else costs.animalCostTransfersIn -= a; }
    else if (r.section === "COP") costs[HEAD_CATEGORY[r.accountCode] ?? "otherDirect"] -= a;
    else if (r.section === "OVH" || r.section === "DEP" || r.section === "INT") costs.overheadDepInterest -= a;
    else if (r.section === "INVCHG" || r.section === "LVCHG") valueChange += a;
  }
  const total = HEAD_COST_KEYS.reduce((s, k) => s + costs[k], 0n);
  const ph = (c: bigint) => (headCount ? Number(c) / 100 / headCount : 0);
  return {
    enterpriseId, headCount, basis, revenueInclTransfersCents: revenue, costs, totalCostCents: total, valueChangeCents: valueChange,
    perHead: {
      revenue: ph(revenue), total: ph(total), profitBeforeInventory: ph(revenue - total), valueChange: ph(valueChange), profitAccrual: ph(revenue - total + valueChange),
      ...Object.fromEntries(HEAD_COST_KEYS.map((k) => [k, ph(costs[k])])),
    } as HeadEconomics["perHead"],
  };
}

/** Livestock break-even: sale price per lb needed to cover cost per head at a given weight. */
export const breakEvenPerLb = (costPerHead: number, weightLb: number) => (weightLb > 0 ? costPerHead / weightLb : null);

// ---------- exposure ----------
export type ExposureLine = { label: string; marketValueCents: bigint; shockCents: bigint };
/** Value at risk from a uniform price move (e.g. -10%) on marketed inventory. */
export function inventoryExposure(items: { label: string; marketValueCents: bigint }[], shockPct: number): ExposureLine[] {
  return items.map((i) => ({ ...i, shockCents: BigInt(Math.round(Number(i.marketValueCents) * shockPct)) }));
}
