import type { PrismaClient } from "@prisma/client";
import {
  priceShock, costShock, repeatYearCost, equipmentPurchase, addUnits, leaseVsProduce, loanPayment,
  enterpriseStatements, cropEconomics, financialRatios, ratioInputsFor, periodFor, twelveMonthForecast, balanceSheetAt, DEFAULT_SCENARIOS,
  type LeverResult, type StatementRow, type Drivers, type ScenarioKey,
} from "@fl/core";
import { loadStatementInputs } from "./statement-inputs.js";
import { loadEnterpriseInputs } from "./enterprise-inputs.js";

/**
 * Scenario-lever templates. Each lever names a template and its parameters; the
 * evaluator pulls bases (spend, revenue, margins, repayment capacity) from the books.
 */
export type LeverParams = Record<string, unknown>;
export const LEVER_TEMPLATES = {
  price_shock: "Price change on a revenue base",
  crop_price_shock: "Price change on planned crop production",
  cost_shock: "Input cost change",
  repeat_year_cost: "Repeat of a past year's costs",
  crop_profit_per_acre: "Crop profit per acre",
  enterprise_income: "Enterprise operating income",
  per_unit_income: "Enterprise income per unit of work",
  equipment_purchase: "Equipment purchase affordability",
  replace_vs_keep: "Replace vs keep equipment",
  add_units: "Add head or units",
  lease_vs_produce: "Lease out acres instead of producing",
  break_even_price: "Break-even price",
  scenario_delta: "Forecast scenario vs base",
  manual: "Owner-entered estimate",
} as const;
export type LeverTemplate = keyof typeof LEVER_TEMPLATES;

type Ctx = Awaited<ReturnType<typeof leverContext>>;
export async function leverContext(prisma: PrismaClient, farmId: string) {
  const inputs = await loadStatementInputs(prisma, farmId);
  const ent = await loadEnterpriseInputs(prisma, farmId, inputs.cutoff);
  const [assets, liabilities, processed, production, forecastSetting] = await Promise.all([
    prisma.asset.findMany({ where: { farmId } }),
    prisma.liability.findMany({ where: { farmId } }),
    prisma.processedAnimal.findMany({ where: { farmId } }),
    prisma.productionRecord.findMany({ where: { farmId } }),
    prisma.forecastSetting.findUnique({ where: { farmId } }),
  ]);
  const asOf = inputs.cutoff ?? new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 0));
  return { prisma, farmId, inputs, ent, assets, liabilities, processed, production, asOf, forecastSetting };
}

const yearRange = (y: number) => ({ from: new Date(Date.UTC(y - 1, 11, 31)), to: new Date(Date.UTC(y, 11, 31)) });
const sumAccounts = (rows: StatementRow[], codes: string[], year: number, sign = 1) => {
  const { from, to } = yearRange(year);
  return BigInt(sign) * rows.filter((r) => codes.includes(r.accountCode) && r.date > from && r.date <= to).reduce((s, r) => s + r.amountCents, 0n);
};
const num = (v: unknown, d = 0) => (typeof v === "number" ? v : typeof v === "string" && v !== "" ? Number(v) : d);
const cents = (v: unknown) => BigInt(Math.round(num(v) * 100));
const entId = (c: Ctx, code: unknown) => c.ent.enterprises.find((e) => e.code === code)?.id ?? null;

export function evaluateLever(c: Ctx, template: LeverTemplate, p: LeverParams): LeverResult | null {
  const rows = c.inputs.rows;
  switch (template) {
    case "price_shock": {
      const base = sumAccounts(rows, p.accounts as string[], num(p.year));
      return priceShock(base, num(p.pct), String(p.label ?? "revenue"));
    }
    case "crop_price_shock": {
      // Planned production and price come from the crop plan unless the lever overrides them.
      const s = c.ent.cropSeasons.filter((x) => x.crop === p.crop && x.year === num(p.year));
      const qty = p.quantity != null ? num(p.quantity) : s.reduce((a, x) => a + x.acres * (x.expectedYield ?? 0), 0);
      const price = p.price != null ? num(p.price) : s[0]?.expectedPrice ?? 0;
      return { ...priceShock(BigInt(Math.round(qty * price * 100)), num(p.pct), `${qty.toLocaleString()} ${(s[0]?.yieldUnit ?? "").replace("/ac", "")} ${p.crop} at $${price}`) };
    }
    case "cost_shock": return costShock(sumAccounts(rows, p.accounts as string[], num(p.year), -1), num(p.pct), String(p.label ?? "spend"));
    case "repeat_year_cost": {
      const codes = p.accounts as string[];
      return repeatYearCost(sumAccounts(rows, codes, num(p.badYear), -1), sumAccounts(rows, codes, num(p.normalYear), -1), `${p.label ?? "Cost"} ${p.badYear}`);
    }
    case "crop_profit_per_acre": {
      const econ = cropEconomics(rows, c.ent.cropSeasons, c.ent.depreciationByEnterpriseYear).filter((e) => e.season.crop === p.crop && e.season.year === num(p.year));
      if (!econ.length) return null;
      const acres = econ.reduce((a, e) => a + e.season.acres, 0);
      const profit = econ.reduce((a, e) => a + e.perAcre.profit * e.season.acres, 0) / acres;
      return { impactCents: BigInt(Math.round(profit * 100)), unit: "$ / acre", basis: `${p.crop} ${p.year}: revenue $${Math.round(econ[0]!.perAcre.revenue).toLocaleString()}/ac less costs $${Math.round(econ[0]!.perAcre.total).toLocaleString()}/ac` };
    }
    case "enterprise_income": {
      const id = entId(c, p.enterprise); if (!id) return null;
      const { from, to } = yearRange(num(p.year));
      const st = enterpriseStatements(rows, from, to).get(id);
      return st ? { impactCents: st.netIncomeOperatingCents, unit: "$ / yr", basis: `${p.year} revenue $${(Number(st.revenueCents) / 100).toLocaleString()} at ${st.grossMarginPct != null ? Math.round(st.grossMarginPct * 100) : 0}% gross margin` } : null;
    }
    case "per_unit_income": {
      const id = entId(c, p.enterprise); if (!id) return null;
      const { from, to } = yearRange(num(p.year));
      const st = enterpriseStatements(rows, from, to).get(id);
      const units = c.production.filter((r) => r.recordType === p.recordType && r.enterpriseId === id && r.date > from && r.date <= to).reduce((a, r) => a + Number(r.quantity ?? 0), 0);
      if (!st || !units) return null;
      return { impactCents: BigInt(Math.round(Number(st.netIncomeOperatingCents) / units)), unit: "$ / hour", basis: `${p.year} net $${Math.round(Number(st.netIncomeOperatingCents) / 100).toLocaleString()} over ${units.toLocaleString()} ${p.unitLabel ?? "units"}` };
    }
    case "equipment_purchase": {
      const r = financialRatios(ratioInputsFor(c.inputs, periodFor("year", new Date(Date.UTC(num(p.marginYear), 11, 31))), c.inputs.ownerLaborAnnualCents));
      return equipmentPurchase({ priceCents: cents(p.price), downPaymentCents: cents(p.down), ratePct: num(p.ratePct), years: num(p.years), repaymentMarginCents: r.repaymentMarginCents }).lever;
    }
    case "replace_vs_keep": {
      const a = c.assets.find((x) => new RegExp(String(p.assetMatch), "i").test(x.description));
      if (!a) return null;
      const repairs = BigInt((a.repairsByYear as Record<string, string> | null)?.[String(p.repairsYear)] ?? "0");
      const note = c.liabilities.find((l) => l.id === a.liabilityId);
      const notePerYear = note?.paymentCents ? note.paymentCents * BigInt(note.paymentFreq === "monthly" ? 12 : note.paymentFreq === "semiannual" ? 2 : note.paymentFreq === "quarterly" ? 4 : 1) : 0n;
      const newPay = loanPayment(cents(p.price) - cents(p.tradeIn), num(p.ratePct), num(p.years));
      const keep = repairs + notePerYear, replace = newPay + cents(p.newRepairs);
      return { impactCents: keep - replace, unit: "$ / yr", basis: `Now: repairs $${(Number(repairs) / 100).toLocaleString()} + note $${(Number(notePerYear) / 100).toLocaleString()} vs new payment $${(Number(newPay) / 100).toLocaleString()} + repairs $${num(p.newRepairs).toLocaleString()}` };
    }
    case "add_units": {
      let margin = cents(p.marginPerUnit);
      if (p.marginSource === "processed_gross_profit") {
        const xs = c.processed.map((x) => Number((x.data as Record<string, unknown>).gross_profit_per_animal)).filter((x) => Number.isFinite(x));
        margin = xs.length ? BigInt(Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100)) : 0n;
      }
      const r = addUnits({ units: num(p.units), marginPerUnitCents: margin, upkeepPerUnitCents: cents(p.upkeepPerUnit), label: String(p.label ?? "units") });
      const fixed = cents(p.fixedCost);
      return fixed ? { ...r, impactCents: r.impactCents - fixed, basis: `${r.basis} − $${num(p.fixedCost).toLocaleString()} fixed` } : r;
    }
    case "lease_vs_produce": {
      const years = p.years as number[];
      const econ = cropEconomics(rows, c.ent.cropSeasons, c.ent.depreciationByEnterpriseYear).filter((e) => e.season.crop === p.crop && years.includes(e.season.year));
      if (!econ.length) return null;
      const margin = econ.reduce((a, e) => a + e.perAcre.profit, 0) / econ.length;
      return leaseVsProduce({ acres: num(p.acres), rentPerAcre: num(p.rentPerAcre), marginPerAcre: margin, savedCostPerAcre: num(p.savedPerAcre) });
    }
    case "break_even_price": {
      const econ = cropEconomics(rows, c.ent.cropSeasons, c.ent.depreciationByEnterpriseYear).find((e) => e.season.crop === p.crop && e.season.year === num(p.year));
      if (!econ?.breakEvenPrice) return null;
      return { impactCents: BigInt(Math.round(econ.breakEvenPrice * 100)), unit: "$ / unit", basis: `$${Math.round(econ.perAcre.total)}/ac cost over ${econ.season.actualYield} ${econ.season.yieldUnit}` };
    }
    case "scenario_delta": {
      const saved = (c.forecastSetting?.scenarios ?? {}) as Partial<Record<ScenarioKey, Drivers>>;
      const line = c.liabilities.find((l) => l.type === "OPERATING_LINE");
      const bs = balanceSheetAt(c.inputs, c.asOf);
      const run = (k: ScenarioKey) => twelveMonthForecast({
        rows, asOf: c.asOf, cashCents: bs.cashCents, loans: c.inputs.loans, assets: c.inputs.assets, reserveCents: c.forecastSetting?.reserveCents ?? 0n,
        drivers: saved[k] ?? DEFAULT_SCENARIOS[k].drivers, line: line ? { limitCents: line.limitCents ?? line.originalCents, ratePct: Number(line.ratePct), balanceCents: bs.operatingLineCents } : null,
      }).reduce((s, m) => s + m.pnl.netIncomeOperatingCents, 0n);
      const base = run("base"), other = run((p.scenario as ScenarioKey) ?? "downside");
      return { impactCents: other - base, unit: "$ / yr", basis: `12-month net income: base $${Math.round(Number(base) / 100).toLocaleString()} vs ${p.scenario ?? "downside"} $${Math.round(Number(other) / 100).toLocaleString()}` };
    }
    case "manual": return { impactCents: cents(p.impact), unit: (p.unit as LeverResult["unit"]) ?? "$ / yr", basis: String(p.basis ?? "Owner estimate") };
  }
  return null;
}

