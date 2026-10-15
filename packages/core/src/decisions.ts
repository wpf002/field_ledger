/**
 * Decision tools (Roadmap 2, Phase 15): what-if levers, equipment purchase,
 * repair vs replace, and budget variance. All money in integer cents; per-unit
 * inputs as plain numbers. Each calculator returns the annual impact and the
 * arithmetic behind it so the UI can show its work.
 */

export type LeverResult = { impactCents: bigint; unit: "$ / yr" | "$ / acre" | "$ / unit" | "$ / hour"; basis: string };
const usd = (c: bigint | number) => {
  const n = typeof c === "bigint" ? Number(c) / 100 : c;
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
};
const pctS = (p: number) => `${p > 0 ? "+" : ""}${Math.round(p * 1000) / 10}%`;

/** A price move on a revenue base: base × change. */
export function priceShock(baseRevenueCents: bigint, pct: number, label = "revenue"): LeverResult {
  const impact = BigInt(Math.round(Number(baseRevenueCents) * pct));
  return { impactCents: impact, unit: "$ / yr", basis: `${usd(baseRevenueCents)} ${label} × ${pctS(pct)}` };
}

/** An input-cost move: spend × change (a cost increase is a negative impact). */
export function costShock(spendCents: bigint, pct: number, label = "spend"): LeverResult {
  const impact = -BigInt(Math.round(Number(spendCents) * pct));
  return { impactCents: impact, unit: "$ / yr", basis: `${usd(spendCents)} ${label} × ${pctS(pct)}` };
}

/** Repeat a bad year's cost: that year's spend less a normal year's. */
export function repeatYearCost(badYearCents: bigint, normalYearCents: bigint, label: string): LeverResult {
  return { impactCents: normalYearCents - badYearCents, unit: "$ / yr", basis: `${label}: ${usd(badYearCents)} vs ${usd(normalYearCents)} in a normal year` };
}

/** Level payment for a loan (annual or monthly periods), rounded to the cent. */
export function loanPayment(principalCents: bigint, ratePct: number, years: number, periodsPerYear = 1): bigint {
  const n = years * periodsPerYear, r = ratePct / 100 / periodsPerYear;
  if (r === 0) return principalCents / BigInt(n);
  const p = (Number(principalCents) * r) / (1 - Math.pow(1 + r, -n));
  return BigInt(Math.round(p));
}

/** Can the business carry a new note? Repayment margin after its annual payment. */
export function equipmentPurchase(x: {
  priceCents: bigint; downPaymentCents: bigint; tradeInCents?: bigint; ratePct: number; years: number; periodsPerYear?: number;
  repaymentMarginCents: bigint; savingsPerYearCents?: bigint; usefulLifeYears?: number; salvageCents?: bigint;
}) {
  const financed = x.priceCents - x.downPaymentCents - (x.tradeInCents ?? 0n);
  const payment = financed > 0n ? loanPayment(financed, x.ratePct, x.years, x.periodsPerYear ?? 1) : 0n;
  const annualPayment = payment * BigInt(x.periodsPerYear ?? 1);
  const totalInterest = annualPayment * BigInt(x.years) - (financed > 0n ? financed : 0n);
  const depreciation = x.usefulLifeYears ? (x.priceCents - (x.salvageCents ?? 0n)) / BigInt(x.usefulLifeYears) : 0n;
  const marginAfter = x.repaymentMarginCents - annualPayment + (x.savingsPerYearCents ?? 0n);
  return {
    financedCents: financed, paymentCents: payment, annualPaymentCents: annualPayment, totalInterestCents: totalInterest,
    annualDepreciationCents: depreciation, cashAtPurchaseCents: -(x.downPaymentCents), marginAfterCents: marginAfter, affordable: marginAfter >= 0n,
    lever: { impactCents: marginAfter, unit: "$ / yr", basis: `Repayment margin ${usd(x.repaymentMarginCents)} less new payment ${usd(annualPayment)}${x.savingsPerYearCents ? ` plus savings ${usd(x.savingsPerYearCents)}` : ""}` } as LeverResult,
  };
}

/**
 * Keep vs repair vs replace, as average annual cash cost over a horizon.
 * Keep: repairs grow each year. Repair: one-time overhaul, lower repairs after.
 * Replace: net price financed, new-machine repairs, resale at the end.
 */
export function repairVsReplace(x: {
  horizonYears: number;
  currentRepairsCents: bigint; repairGrowthPct: number; currentNotePaymentCents: bigint; currentNoteYearsLeft: number; currentResaleCents: bigint;
  overhaulCents: bigint; repairsAfterOverhaulCents: bigint;
  replacementPriceCents: bigint; tradeInCents: bigint; ratePct: number; termYears: number; newRepairsCents: bigint; resaleAtEndCents: bigint;
  /** Lost work, rentals, and custom hire while an old machine is down, per year if kept. */
  downtimeCostKeepCents?: bigint;
  /** Fuel, labor, and throughput saved per year by the newer machine (operating efficiency). */
  efficiencySavingsCents?: bigint;
}) {
  const H = x.horizonYears;
  const notePaid = (years: number) => x.currentNotePaymentCents * BigInt(Math.min(years, x.currentNoteYearsLeft));
  let keep = notePaid(H) + (x.downtimeCostKeepCents ?? 0n) * BigInt(H);
  for (let y = 0; y < H; y++) keep += BigInt(Math.round(Number(x.currentRepairsCents) * Math.pow(1 + x.repairGrowthPct, y)));
  const repair = notePaid(H) + x.overhaulCents + x.repairsAfterOverhaulCents * BigInt(H);
  const financed = x.replacementPriceCents - x.tradeInCents;
  const pay = financed > 0n ? loanPayment(financed, x.ratePct, x.termYears) : 0n;
  // Trading in retires the old note: its remaining balance is assumed covered by the trade-in.
  const replace = pay * BigInt(Math.min(H, x.termYears)) + x.newRepairsCents * BigInt(H) - x.resaleAtEndCents - (x.efficiencySavingsCents ?? 0n) * BigInt(H);
  const avg = (c: bigint) => c / BigInt(H);
  const options = [
    { key: "keep", label: "Keep", totalCents: keep, perYearCents: avg(keep) },
    { key: "repair", label: "Repair", totalCents: repair, perYearCents: avg(repair) },
    { key: "replace", label: "Replace", totalCents: replace, perYearCents: avg(replace) },
  ] as const;
  const best = [...options].sort((a, b) => (a.totalCents < b.totalCents ? -1 : 1))[0]!;
  return { options, best, newPaymentCents: pay };
}

/** Add units (head, hens, acres) at a known margin per unit, less added fixed upkeep. */
export function addUnits(x: { units: number; marginPerUnitCents: bigint; upkeepPerUnitCents?: bigint; label: string }): LeverResult {
  const impact = BigInt(Math.round(x.units * Number(x.marginPerUnitCents - (x.upkeepPerUnitCents ?? 0n))));
  return { impactCents: impact, unit: "$ / yr", basis: `${x.units} ${x.label} × (${usd(x.marginPerUnitCents)} margin${x.upkeepPerUnitCents ? ` − ${usd(x.upkeepPerUnitCents)} upkeep` : ""})` };
}

/** Lease land out instead of farming it: rent per acre vs current margin per acre. */
export function leaseVsProduce(x: { acres: number; rentPerAcre: number; marginPerAcre: number; savedCostPerAcre?: number }): LeverResult {
  const per = x.rentPerAcre + (x.savedCostPerAcre ?? 0) - x.marginPerAcre;
  return { impactCents: BigInt(Math.round(per * x.acres * 100)), unit: "$ / yr", basis: `${x.acres} ac × ($${x.rentPerAcre} rent${x.savedCostPerAcre ? ` + $${x.savedCostPerAcre} saved` : ""} − $${x.marginPerAcre.toFixed(2)} margin)` };
}

// ---------- budget variance ----------
export type VarianceLine = { label: string; plannedCents: bigint; actualCents: bigint; varianceCents: bigint; variancePct: number | null; favorable: boolean };
/** Variance with direction: revenue over plan is favorable, expenses over plan are not. */
export function variance(label: string, plannedCents: bigint, actualCents: bigint, kind: "revenue" | "expense" | "profit"): VarianceLine {
  const v = actualCents - plannedCents;
  return { label, plannedCents, actualCents, varianceCents: v, variancePct: plannedCents === 0n ? null : Number(v) / Math.abs(Number(plannedCents)), favorable: kind === "expense" ? v <= 0n : v >= 0n };
}

/**
 * Split a revenue or cost change into price and volume from quantity × unit price rows.
 * Volume effect = Δqty × prior price; price effect = Δprice × current qty.
 */
export function priceVolume(prior: { quantity: number; amountCents: bigint }[], current: { quantity: number; amountCents: bigint }[]) {
  const q0 = prior.reduce((a, r) => a + r.quantity, 0), q1 = current.reduce((a, r) => a + r.quantity, 0);
  const a0 = prior.reduce((a, r) => a + Number(r.amountCents), 0), a1 = current.reduce((a, r) => a + Number(r.amountCents), 0);
  if (!q0 || !q1) return null;
  const p0 = a0 / q0, p1 = a1 / q1;
  return { volumeCents: BigInt(Math.round((q1 - q0) * p0)), priceCents: BigInt(Math.round((p1 - p0) * q1)), volumePct: q1 / q0 - 1, pricePct: p1 / p0 - 1 };
}

/**
 * Sell now or hold stored grain (spec §27). Holding earns the later price on what
 * survives shrink, less storage and the interest on money not collected (or the
 * operating line it keeps drawn).
 */
export function sellOrHold(x: { quantity: number; priceNow: number; priceLater: number; months: number; storagePerUnitMonth: number; interestPct: number; shrinkPct: number }) {
  const sellNow = x.quantity * x.priceNow;
  const kept = x.quantity * (1 - x.shrinkPct);
  const storage = x.quantity * x.storagePerUnitMonth * x.months;
  const interest = sellNow * (x.interestPct / 100) * (x.months / 12);
  const hold = kept * x.priceLater - storage - interest;
  const c = (v: number) => BigInt(Math.round(v * 100));
  return {
    sellNowCents: c(sellNow), holdCents: c(hold), holdGainCents: c(hold - sellNow), storageCents: c(storage), interestCents: c(interest),
    breakEvenPrice: kept > 0 ? (sellNow + storage + interest) / kept : null,
    better: hold > sellNow ? ("hold" as const) : ("sell" as const),
  };
}
