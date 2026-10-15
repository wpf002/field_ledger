import type { PrismaClient } from "@prisma/client";
import {
  enterpriseStatements, incomeStatement, balanceSheetAt, cropEconomics, financialRatios, ratioInputsFor, periodFor,
  twelveMonthForecast, loanPayment, DEFAULT_SCENARIOS, type Drivers, type ScenarioKey,
} from "@fl/core";
import { loadStatementInputs } from "./statement-inputs.js";
import { loadEnterpriseInputs } from "./enterprise-inputs.js";

/**
 * Insights engine (Roadmap 2, Phase 16). Deterministic detectors over the books;
 * every figure in a finding comes from a record and each insight lists its sources.
 * An LLM may phrase these, but never adds numbers to them.
 */
export type Severity = "Critical" | "Warning" | "Watch" | "Opportunity" | "Positive";
export type Insight = {
  topic: string; severity: Severity; title: string; finding: string; recommendation: string;
  metrics: Record<string, number | string>; sources: string[];
};

const usd = (cents: bigint | number) => {
  const n = typeof cents === "bigint" ? Number(cents) / 100 : cents;
  const a = Math.abs(n);
  return `${n < 0 ? "-" : ""}$${a >= 1e6 ? `${(a / 1e6).toFixed(2)}M` : Math.round(a).toLocaleString("en-US")}`;
};
const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`;
const D = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
const yearRange = (y: number, cutoff: Date) => ({ from: D(y - 1, 11, 31), to: y === cutoff.getUTCFullYear() ? cutoff : D(y, 11, 31) });

export async function generateInsights(prisma: PrismaClient, farmId: string): Promise<Insight[]> {
  const inputs = await loadStatementInputs(prisma, farmId);
  const cutoff = inputs.cutoff ?? D(new Date().getUTCFullYear(), new Date().getUTCMonth(), 0);
  const ent = await loadEnterpriseInputs(prisma, farmId, inputs.cutoff);
  const [labor, production, invoices, txns, assets, weather, processed, animals, repro, bullVals, liabilities, setting] = await Promise.all([
    prisma.laborEntry.findMany({ where: { farmId } }),
    prisma.productionRecord.findMany({ where: { farmId } }),
    prisma.invoice.findMany({ where: { farmId }, include: { customer: true } }),
    prisma.transaction.findMany({ where: { farmId, entryType: "ledger" }, select: { date: true, cashDate: true, amountCents: true, customerId: true, quantity: true, unitPrice: true, enterpriseId: true, account: { select: { code: true, section: true, statementLine: true } } } }),
    prisma.asset.findMany({ where: { farmId } }),
    prisma.weatherMonth.findMany({ where: { farmId } }),
    prisma.processedAnimal.findMany({ where: { farmId } }),
    prisma.animal.findMany({ where: { farmId, salePriceCents: { not: null } }, select: { grade: true, salePriceCents: true, dispositionDate: true, currentClass: true } }),
    prisma.reproductionYear.findMany({ where: { farmId }, orderBy: { year: "asc" } }),
    prisma.bullValuation.findMany({ where: { farmId }, orderBy: { asOf: "desc" } }),
    prisma.liability.findMany({ where: { farmId } }),
    prisma.forecastSetting.findUnique({ where: { farmId } }),
  ]);
  const semenSnaps = await prisma.inventorySnapshot.findMany({ where: { farmId, category: "Semen inventory", asOf: cutoff } });
  const customers = new Map(invoices.map((i) => [i.customerId, i.customer.name]));
  for (const c of await prisma.customer.findMany({ where: { farmId } })) customers.set(c.id, c.name);
  const entNames = new Map(ent.enterprises.map((e) => [e.id, e.name.split(" (")[0]!]));
  const name = { get: (id: string | null | undefined) => (id ? entNames.get(id) : undefined) ?? "Unassigned" };
  const isOverhead = (id: string | null) => !id || ent.enterprises.find((e) => e.id === id)?.code === "OVH";
  const lastFull = cutoff.getUTCMonth() === 11 ? cutoff.getUTCFullYear() : cutoff.getUTCFullYear() - 1;
  const firstYear = inputs.opening.asOf.getUTCFullYear() + 1;
  const years = Array.from({ length: Math.max(0, lastFull - firstYear + 1) }, (_, i) => firstYear + i);
  const stByYear = new Map(years.map((y) => [y, enterpriseStatements(inputs.rows, yearRange(y, cutoff).from, yearRange(y, cutoff).to)]));
  const out: Insight[] = [];
  const run = (fn: () => Insight | Insight[] | null | undefined) => { try { const r = fn(); if (r) out.push(...(Array.isArray(r) ? r : [r])); } catch { /* a detector without the data it needs stays silent */ } };
  if (!years.length) return out;
  const last = stByYear.get(lastFull)!;
  const totalRev = [...last.values()].reduce((s, x) => s + x.revenueCents, 0n);

  // --- enterprise results ---
  run(() => {
    const ops = [...last.entries()].filter(([id]) => !isOverhead(id) && !ent.enterprises.some((e) => e.parentId === id));
    const best = ops.sort((a, b) => Number(b[1].netIncomeOperatingCents - a[1].netIncomeOperatingCents))[0];
    if (!best || best[1].netIncomeOperatingCents <= 0n) return null;
    const positive = ops.reduce((s, [, x]) => s + (x.netIncomeOperatingCents > 0n ? x.netIncomeOperatingCents : 0n), 0n);
    const share = Number(best[1].netIncomeOperatingCents) / Number(positive);
    const revShare = totalRev ? Number(best[1].revenueCents) / Number(totalRev) : 0;
    return {
      topic: "best_enterprise", severity: "Positive",
      title: share > 0.6 ? `${name.get(best[0])} carries the business` : `${name.get(best[0])} is the most profitable enterprise`,
      finding: `${name.get(best[0])} earned ${usd(best[1].netIncomeOperatingCents)} in ${lastFull} on ${usd(best[1].revenueCents)} of revenue (${pct(best[1].grossMarginPct ?? 0)} gross margin), ${pct(share)} of the profit from profitable enterprises.`,
      recommendation: `Protect this enterprise's capacity first when cash or labor is short.`,
      metrics: { net_income: Number(best[1].netIncomeOperatingCents) / 100, revenue_share: revShare, gross_margin: best[1].grossMarginPct ?? 0 }, sources: ["income_statement_by_enterprise"],
    };
  });
  run(() => {
    const out2: Insight[] = [];
    for (const e of ent.enterprises) {
      if (isOverhead(e.id) || ent.enterprises.some((c) => c.parentId === e.id)) continue;
      const series = years.slice(-3).map((y) => stByYear.get(y)!.get(e.id)?.netIncomeOperatingCents ?? null);
      // Accrual results too, so a herd that grows in value isn't called a loss.
      const accrual = years.slice(-3).map((y) => stByYear.get(y)!.get(e.id)?.netFarmIncomeCents ?? null);
      if (series.length >= 3 && series.every((v) => v != null && v < 0n) && accrual.every((v) => v != null && v < 0n)) {
        out2.push({ topic: "persistent_loss", severity: "Warning", title: `${name.get(e.id)} has lost money every year`,
          finding: `Operating results ${years.slice(-3).map((y, i) => `${y}: ${usd(series[i]!)}`).join(", ")}.`,
          recommendation: `Decide whether to restructure, rent out, or exit ${name.get(e.id)}; price what the land and labor earn elsewhere.`,
          metrics: Object.fromEntries(years.slice(-3).map((y, i) => [String(y), Number(series[i]!) / 100])), sources: ["income_statement_by_enterprise"] });
      }
      const first = stByYear.get(years[0]!)!.get(e.id)?.netIncomeOperatingCents, now = last.get(e.id)?.netIncomeOperatingCents;
      if (first != null && now != null && first < 0n && now > 0n && years.length >= 2) {
        out2.push({ topic: "turnaround", severity: "Positive", title: `${name.get(e.id)} moved from a loss to a profit`,
          finding: `${usd(first)} in ${years[0]} to ${usd(now)} in ${lastFull}.`, recommendation: `Keep the changes that turned it around; check they hold in a normal price year.`,
          metrics: { [`result_${years[0]}`]: Number(first) / 100, [`result_${lastFull}`]: Number(now) / 100 }, sources: ["income_statement_by_enterprise"] });
      }
    }
    return out2;
  });
  run(() => {
    // Unpaid family labor at $15/hour.
    const RATE = 15;
    const res: Insight[] = [];
    const ly = labor.filter((l) => l.month.getUTCFullYear() === lastFull && /family|unpaid|owner/i.test(l.workerType));
    const byEnt = new Map<string, number>();
    for (const l of ly) if (l.enterpriseId) byEnt.set(l.enterpriseId, (byEnt.get(l.enterpriseId) ?? 0) + Number(l.hours));
    for (const [id, hours] of byEnt) {
      const s = last.get(id); if (!s || isOverhead(id)) continue;
      const charge = BigInt(Math.round(hours * RATE * 100));
      if (s.netIncomeOperatingCents >= 0n && s.netIncomeOperatingCents - charge < 0n && s.revenueCents > 0n) {
        res.push({ topic: "family_labor_loss", severity: "Warning", title: `${name.get(id)} loses money once family time is counted`,
          finding: `${name.get(id)} cleared ${usd(s.netIncomeOperatingCents)} in ${lastFull}, but took ${Math.round(hours).toLocaleString()} unpaid family hours. At $${RATE}/hour that is ${usd(charge)}.`,
          recommendation: `Raise prices, cut the hours, or drop the enterprise if the time has a better use.`,
          metrics: { revenue: Number(s.revenueCents) / 100, family_hours: hours, operating_result: Number(s.netIncomeOperatingCents) / 100 }, sources: ["labor_hours", "income_statement_by_enterprise"] });
      }
    }
    return res.sort((a, b) => Number(a.metrics.operating_result) - Number(b.metrics.operating_result)).slice(0, 2);
  });

  // --- crops ---
  const crops = cropEconomics(inputs.rows, ent.cropSeasons, ent.depreciationByEnterpriseYear).filter((c) => c.season.year === lastFull && c.season.acres > 0);
  run(() => {
    const byCrop = new Map<string, { profit: number; acres: number }>();
    for (const c of crops) { const x = byCrop.get(c.season.crop) ?? { profit: 0, acres: 0 }; x.profit += c.perAcre.profit * c.season.acres; x.acres += c.season.acres; byCrop.set(c.season.crop, x); }
    const list = [...byCrop.entries()].map(([crop, x]) => ({ crop, perAcre: x.profit / x.acres }));
    if (list.length < 3) return null;
    list.sort((a, b) => b.perAcre - a.perAcre);
    const top = list[0]!, bottom = list[list.length - 1]!;
    if (!(bottom.perAcre < 0 || top.perAcre >= 2 * Math.max(1, bottom.perAcre))) return null;
    return { topic: "crop_per_acre_spread", severity: "Opportunity", title: `${top.crop} earns far more per acre than ${bottom.crop.toLowerCase()}`,
      finding: `${lastFull} profit per acre: ${list.map((l) => `${l.crop} ${usd(l.perAcre)}`).join(", ")}.`,
      recommendation: `Shift acres from ${bottom.crop.toLowerCase()} toward ${top.crop.toLowerCase()} as far as sales allow.`,
      metrics: Object.fromEntries(list.map((l) => [l.crop, Math.round(l.perAcre * 100) / 100])), sources: ["unit_economics_crops"] };
  });
  run(() => {
    const recs = production.filter((p) => p.date.getUTCFullYear() === lastFull && p.extra && typeof (p.extra as Record<string, unknown>).unsold === "number");
    if (!recs.length) return null;
    let harvested = 0, unsold = 0;
    for (const p of recs) { const x = p.extra as Record<string, number>; harvested += Number(p.quantity ?? 0); unsold += Number(x.unsold ?? 0); }
    if (!harvested || unsold / harvested < 0.25) return null;
    return { topic: "unsold_production", severity: "Watch", title: `About ${pct(unsold / harvested)} of what was harvested never sold`,
      finding: `${lastFull}: ${Math.round(unsold).toLocaleString()} of ${Math.round(harvested).toLocaleString()} ${recs[0]!.unit ?? "units"} harvested went unsold.`,
      recommendation: `Plant to demand, add a wholesale or second outlet for seconds, or pick less often.`,
      metrics: { harvested, unsold, unsold_share: unsold / harvested }, sources: ["production_records"] };
  });
  run(() => {
    // A crop that lost money per acre in each of the last three closed seasons.
    const all = cropEconomics(inputs.rows, ent.cropSeasons, ent.depreciationByEnterpriseYear).filter((c) => c.season.year <= lastFull && c.season.actualYield);
    const res: Insight[] = [];
    for (const crop of new Set(all.map((c) => c.season.crop))) {
      const ys = [...new Set(all.filter((c) => c.season.crop === crop).map((c) => c.season.year))].sort().slice(-3);
      if (ys.length < 3) continue;
      const per = ys.map((y) => { const cs = all.filter((c) => c.season.crop === crop && c.season.year === y); const ac = cs.reduce((a, c) => a + c.season.acres, 0); return cs.reduce((a, c) => a + c.perAcre.profit * c.season.acres, 0) / ac; });
      if (per.every((p) => p < 0)) res.push({ topic: "persistent_loss", severity: "Warning", title: `${crop} has lost money every year`,
        finding: `Profit per acre ${ys.map((y, i) => `${y}: ${usd(per[i]!)}`).join(", ")}, including insurance and program payments.`,
        recommendation: `Price what the ground would earn leased out or in another crop, and decide before the next planting.`,
        metrics: Object.fromEntries(ys.map((y, i) => [String(y), Math.round(per[i]! * 100) / 100])), sources: ["unit_economics_crops"] });
    }
    return res;
  });
  run(() => {
    const be = cropEconomics(inputs.rows, ent.cropSeasons, ent.depreciationByEnterpriseYear).filter((c) => c.breakEvenPrice && c.season.actualAvgPrice).sort((a, b) => b.season.year - a.season.year)[0];
    const lastPrice = cropEconomics(inputs.rows, ent.cropSeasons, ent.depreciationByEnterpriseYear).filter((c) => c.season.crop === be?.season.crop && c.season.year < (be?.season.year ?? 0) && c.season.actualAvgPrice).sort((a, b) => b.season.year - a.season.year)[0]?.season.actualAvgPrice ?? be?.season.actualAvgPrice;
    if (!be || !lastPrice || be.breakEvenPrice! < lastPrice * 0.85) return null;
    const unit = (be.season.yieldUnit ?? "").split("/")[0];
    return { topic: "break_even", severity: be.breakEvenPrice! >= lastPrice ? "Critical" : "Warning", title: `Break-even ${be.season.crop.toLowerCase()} price is now about $${be.breakEvenPrice!.toFixed(2)} a ${unit}`,
      finding: `${be.season.year} costs need $${be.breakEvenPrice!.toFixed(2)} per ${unit}; the last average price was $${lastPrice.toFixed(2)}.`,
      recommendation: `Price ahead of the break-even, cut the largest per-acre cost, or plan for a thin year.`,
      metrics: { break_even: be.breakEvenPrice!, last_price: lastPrice }, sources: ["unit_economics_crops", "crop_seasons"] };
  });
  run(() => {
    // Rainfall: compare yield in the driest growing season with the best.
    if (!weather.length) return null;
    const seasonRain = (y: number) => { const m = weather.filter((w) => w.year === y && w.month >= 4 && w.month <= 8); return m.length ? m.reduce((a, w) => a + Number(w.rainfallIn), 0) / m.reduce((a, w) => a + Number(w.normalIn), 0) : null; };
    const yields = ent.cropSeasons.filter((s) => s.actualYield && !s.planned).map((s) => ({ y: s.year, yield: s.actualYield!, rain: seasonRain(s.year), unit: s.yieldUnit }));
    const withRain = yields.filter((x) => x.rain != null);
    if (withRain.length < 3) return null;
    const dry = withRain.reduce((a, b) => (b.rain! < a.rain! ? b : a)), best = withRain.reduce((a, b) => (b.yield > a.yield ? b : a));
    if (dry.rain! > 0.75 || dry.yield > best.yield * 0.7) return null;
    return { topic: "weather", severity: "Critical", title: `Summer rainfall decides the year`,
      finding: `${dry.y} had ${pct(dry.rain!)} of normal April-August rain and yielded ${dry.yield} ${dry.unit}, vs ${best.yield} in ${best.y}.`,
      recommendation: `Hold a cash reserve sized for a dry year and line up hay/feed or sales contracts before July.`,
      metrics: Object.fromEntries(withRain.map((x) => [String(x.y), x.yield])), sources: ["weather", "crop_seasons"] };
  });

  // --- costs ---
  const spend = (y: number, filter: (t: (typeof txns)[number]) => boolean) => { const r = yearRange(y, cutoff); return -txns.filter((t) => t.date > r.from && t.date <= r.to && filter(t)).reduce((s, t) => s + t.amountCents, 0n); };
  run(() => {
    if (years.length < 3) return null;
    const lines = new Set(txns.filter((t) => t.account.section === "COP" || t.account.section === "OVH").map((t) => t.account.statementLine ?? ""));
    const res: { line: string; a: bigint; b: bigint; g: number }[] = [];
    for (const line of lines) {
      if (!line) continue;
      const a = spend(years[0]!, (t) => t.account.statementLine === line), b = spend(lastFull, (t) => t.account.statementLine === line);
      if (a >= 200_000n && b > a) res.push({ line, a, b, g: Number(b) / Number(a) - 1 });
    }
    const top = res.filter((r) => r.g >= 0.25).sort((x, y) => y.g - x.g).slice(0, 2);
    return top.map((r) => ({ topic: "cost_growth", severity: r.g >= 0.4 ? "Warning" : "Watch", title: `${r.line} costs are up ${pct(r.g)} since ${years[0]}`,
      finding: `${r.line}: ${usd(r.a)} in ${years[0]} vs ${usd(r.b)} in ${lastFull}.`, recommendation: `Get competing quotes or change the program before next year's budget.`,
      metrics: { [String(years[0])]: Number(r.a) / 100, [String(lastFull)]: Number(r.b) / 100 }, sources: ["transactions"] } as Insight));
  });
  run(() => {
    // Contracted unit rates (e.g. $/bale custom baling) rising.
    const rows = txns.filter((t) => t.account.section === "COP" && t.unitPrice != null && ["5050", "5055", "5060", "5100"].includes(t.account.code));
    const byCode = new Map<string, typeof rows>();
    for (const t of rows) byCode.set(t.account.code, [...(byCode.get(t.account.code) ?? []), t]);
    const res: Insight[] = [];
    for (const [code, rs] of byCode) {
      const avg = (y: number) => { const xs = rs.filter((t) => t.date.getUTCFullYear() === y).map((t) => Number(t.unitPrice)); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; };
      const y0 = years.find((y) => avg(y) != null), y1 = cutoff.getUTCFullYear();
      const a = y0 ? avg(y0) : null, b = avg(y1) ?? avg(lastFull);
      if (a && b && b / a - 1 >= 0.15) res.push({ topic: "unit_rate_growth", severity: "Warning", title: `The contracted rate is up ${pct(b / a - 1)}`,
        finding: `Account ${code} averaged $${a.toFixed(2)} per unit in ${y0} and $${b.toFixed(2)} now.`, recommendation: `Bid the work out or weigh owning the equipment.`,
        metrics: { [`rate_${y0}`]: a, rate_now: b }, sources: ["transactions"] });
    }
    return res.slice(0, 1);
  });
  run(() => {
    // Processing cost per lb vs price per lb on processed animals.
    const byYear = new Map<number, { cost: number; lb: number }>();
    for (const p of processed) { const d = p.data as Record<string, number>; const y = p.processedAt?.getUTCFullYear(); const lb = Number(d.hanging_weight_lb); const c = Number(d.processing_cost); if (!y || !lb || !c) continue; const x = byYear.get(y) ?? { cost: 0, lb: 0 }; x.cost += c; x.lb += lb; byYear.set(y, x); }
    const ys = [...byYear.keys()].sort();
    if (ys.length < 2) return null;
    const a = byYear.get(ys[0]!)!, b = byYear.get(ys[ys.length - 1]!)!;
    const ca = a.cost / a.lb, cb = b.cost / b.lb, g = cb / ca - 1;
    if (g < 0.15) return null;
    return { topic: "cost_vs_price", severity: "Warning", title: `Processing costs are rising faster than prices`,
      finding: `Processing cost rose from $${ca.toFixed(2)} to $${cb.toFixed(2)} per hanging lb (${ys[0]}-${ys[ys.length - 1]}), up ${pct(g)}.`,
      recommendation: `Re-price shares per hanging pound or negotiate processor slots and fees.`, metrics: { [`per_lb_${ys[0]}`]: ca, [`per_lb_${ys[ys.length - 1]}`]: cb }, sources: ["processed_animal_economics"] };
  });
  run(() => {
    const fert = spend(lastFull, (t) => t.account.code === "5020");
    const ni = incomeStatement(inputs.rows, yearRange(lastFull, cutoff).from, yearRange(lastFull, cutoff).to).netIncomeOperatingCents;
    if (fert <= 0n || ni <= 0n) return null;
    const hit = (fert * 20n) / 100n, share = Number(hit) / Number(ni);
    if (share < 0.05) return null;
    return { topic: "input_sensitivity", severity: "Watch", title: `A 20% fertilizer increase would take ${pct(share)} of ${lastFull} profit`,
      finding: `${lastFull} fertilizer was ${usd(fert)}; +20% is ${usd(hit)} against ${usd(ni)} net income.`, recommendation: `Book part of next year's fertilizer early and soil-test before cutting rates.`,
      metrics: { fertilizer: Number(fert) / 100, impact: Number(hit) / 100 }, sources: ["transactions"] };
  });

  // --- funding, debt, liquidity ---
  run(() => {
    const contrib = txns.filter((t) => t.account.code === "8040");
    const total = contrib.reduce((s, t) => s + t.amountCents, 0n);
    if (contrib.length < 2 || total <= 0n) return null;
    const months = new Map<number, number>(); for (const c of contrib) months.set(c.date.getUTCMonth(), (months.get(c.date.getUTCMonth()) ?? 0) + 1);
    const peak = [...months.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    const mName = new Date(Date.UTC(2000, peak, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
    return { topic: "owner_funding", severity: "Watch", title: `Off-farm money keeps the farm running`,
      finding: `Owners put in ${usd(total)} across ${contrib.length} deposits since ${firstYear}, most often in ${mName}.`,
      recommendation: `Build a seasonal cash reserve or a small operating line so the farm stands on its own.`,
      metrics: { owner_contributions: Number(total) / 100 }, sources: ["transactions"] };
  });
  const ttm = financialRatios(ratioInputsFor(inputs, periodFor("ttm", cutoff), inputs.ownerLaborAnnualCents));
  run(() => {
    const roa = ttm.returnOnAssetsMarket ?? ttm.returnOnAssetsCost;
    if (roa == null || roa >= 0.03) return null;
    const bs = balanceSheetAt(inputs, cutoff);
    return { topic: "low_return_on_assets", severity: "Watch", title: roa < 0.01 ? `The asset base earns under 1%` : `Low return on ${usd(bs.totalAssetsCents + bs.landMarketCents - bs.landCents)} of assets`,
      finding: `Over the last 12 months the operation earned ${pct(roa, 1)} on assets at market value (${pct(ttm.returnOnAssetsCost ?? 0, 1)} at cost) after a ${usd(ttm.ownerLaborCents)} owner labor charge.`,
      recommendation: `Rank enterprises by return on the land and capital they tie up; lease or sell what earns least.`,
      metrics: { roa_market: roa, roa_cost: ttm.returnOnAssetsCost ?? 0 }, sources: ["financial_ratios", "balance_sheet"] };
  });
  run(() => {
    const open = balanceSheetAt(inputs, inputs.opening.asOf), now = balanceSheetAt(inputs, cutoff);
    const da0 = Number(open.totalLiabilitiesCents) / Number(open.totalAssetsCents), da1 = Number(now.totalLiabilitiesCents) / Number(now.totalAssetsCents);
    const ending = liabilities.filter((l) => l.type !== "OPERATING_LINE" && l.maturityAt && l.maturityAt.getTime() - cutoff.getTime() < 550 * 86_400_000 && l.maturityAt > cutoff);
    if (!(da0 - da1 >= 0.08)) return null;
    return { topic: "debt_paydown", severity: "Positive", title: `Debt is falling steadily`,
      finding: `Debt to assets fell from ${pct(da0)} to ${pct(da1)}.${ending.length ? ` ${ending.length} note${ending.length > 1 ? "s" : ""} pay off within 18 months.` : ""}`,
      recommendation: `Plan where the freed-up payments go before they disappear into spending.`, metrics: { debt_to_asset_start: da0, debt_to_asset_now: da1 }, sources: ["balance_sheet", "loans"] };
  });
  run(() => {
    const wc = years.slice(-3).map((y) => { const b = balanceSheetAt(inputs, D(y, 11, 31)); return b.totalCurrentAssetsCents - b.totalCurrentLiabilitiesCents; });
    if (wc.length < 3 || !(wc[0]! > wc[1]! && wc[1]! > wc[2]!)) return null;
    return { topic: "working_capital_decline", severity: "Warning", title: `Working capital is eroding`,
      finding: `Year-end working capital: ${years.slice(-3).map((y, i) => `${y} ${usd(wc[i]!)}`).join(", ")}.`,
      recommendation: `Stop funding term payments and equipment from the operating line; refinance into term debt if needed.`,
      metrics: Object.fromEntries(years.slice(-3).map((y, i) => [`wc_${y}`, Number(wc[i]!) / 100])), sources: ["balance_sheet", "financial_ratios"] };
  });
  run((): Insight | null => {
    const line = liabilities.find((l) => l.type === "OPERATING_LINE");
    if (!line) return null;
    const bs = balanceSheetAt(inputs, cutoff);
    const saved = (setting?.scenarios ?? {}) as Partial<Record<ScenarioKey, Drivers>>;
    const fc = twelveMonthForecast({ rows: inputs.rows, asOf: cutoff, cashCents: bs.cashCents, loans: inputs.loans, assets: inputs.assets, reserveCents: setting?.reserveCents ?? 2_500_000n,
      drivers: saved.base ?? DEFAULT_SCENARIOS.base.drivers, line: { limitCents: line.limitCents ?? line.originalCents, ratePct: Number(line.ratePct), balanceCents: bs.operatingLineCents } });
    const limit = line.limitCents ?? line.originalCents;
    const peak = fc.reduce((a, m) => (m.cash.lineBalanceCents > a ? m.cash.lineBalanceCents : a), 0n);
    const minCash = fc.reduce((a, m) => (m.cash.endingCashCents < a ? m.cash.endingCashCents : a), fc[0]!.cash.endingCashCents);
    const util = Number(peak) / Number(limit);
    if (util >= 0.95 || minCash < 0n) return { topic: "line_capacity", severity: "Critical" as Severity, title: `The operating line can't carry the next 12 months`,
      finding: `The base forecast draws the ${usd(limit)} line to ${usd(peak)} (${pct(util)}) and cash bottoms at ${usd(minCash)}.`,
      recommendation: `Ask the lender now for a larger line or a term-out, and move collections and input purchases to ease the peak.`,
      metrics: { line_limit: Number(limit) / 100, forecast_peak: Number(peak) / 100, forecast_min_cash: Number(minCash) / 100 }, sources: ["forecast_12_month", "loans"] };
    if (util >= 0.6) return { topic: "line_seasonal", severity: "Watch" as Severity, title: `Seasonal credit needs are large`,
      finding: `The line peaks at ${usd(peak)} of ${usd(limit)} (${pct(util)}) in the next 12 months.`, recommendation: `Time big sales and purchases to flatten the peak; keep the line renewal ahead of it.`,
      metrics: { forecast_peak: Number(peak) / 100, line_limit: Number(limit) / 100 }, sources: ["forecast_12_month", "loans"] };
    return null;
  });

  // --- equipment ---
  const repairsOf = (a: (typeof assets)[number]) => (a.repairsByYear ?? {}) as Record<string, string>;
  const rising = assets.filter((a) => !a.disposedAt && a.category !== "Land").map((a) => {
    const r = repairsOf(a), r0 = Number(r[String(years[0])] ?? 0), r1 = Number(r[String(lastFull)] ?? 0);
    return { a, r0, r1, g: r0 ? r1 / r0 : 0 };
  }).filter((x) => x.r0 > 0 && x.r1 >= 300_000 && x.g >= 1.5).sort((x, y) => y.r1 - x.r1);
  run(() => {
    const x = rising[0]; if (!x) return null;
    return { topic: "repairs_rising", severity: "Watch", title: `Repairs on the ${x.a.description.split(" (")[0]} are up ${x.g.toFixed(1)}x`,
      finding: `Repairs went from ${usd(x.r0)} in ${years[0]} to ${usd(x.r1)} in ${lastFull}.`, recommendation: `Run repair-or-replace before the next season's big repair bill.`,
      metrics: Object.fromEntries(Object.entries(repairsOf(x.a)).filter(([k]) => /^\d{4}$/.test(k)).map(([k, v]) => [k, Number(v) / 100])), sources: ["assets", "transactions"] };
  });
  run(() => {
    const x = rising.find((r) => r.a.category === "Vehicles") ?? rising[0]; if (!x) return null;
    const fy = financialRatios(ratioInputsFor(inputs, periodFor("year", D(lastFull, 11, 31)), inputs.ownerLaborAnnualCents));
    const price = (x.a.originalCostCents * 13n) / 10n;
    const pay = loanPayment(price, 7.5, 5);
    if (fy.repaymentMarginCents < pay) return null;
    return { topic: "equipment_affordability", severity: "Opportunity", title: `The farm can carry a replacement for the ${x.a.description.split(" (")[0]}`,
      finding: `A ${usd(price)} replacement on a 5-year note is about ${usd(pay)} a year; ${lastFull} repayment margin was ${usd(fy.repaymentMarginCents)}.`,
      recommendation: `Price replacements now and decide before the next big repair.`, metrics: { repayment_margin: Number(fy.repaymentMarginCents) / 100, annual_payment: Number(pay) / 100 }, sources: ["assets", "financial_ratios"] };
  });

  // --- customers ---
  run(() => {
    const open = invoices.filter((i) => i.status !== "PAID" && i.dueAt < cutoff);
    const byCust = new Map<string, { bal: bigint; days: number }>();
    for (const i of open) { const days = Math.floor((cutoff.getTime() - i.dueAt.getTime()) / 86_400_000); const x = byCust.get(i.customerId) ?? { bal: 0n, days: 0 }; x.bal += i.totalCents - i.amountPaidCents; x.days = Math.max(x.days, days); byCust.set(i.customerId, x); }
    const worst = [...byCust.entries()].filter(([, x]) => x.days > 45).sort((a, b) => Number(b[1].bal - a[1].bal))[0];
    if (!worst) return null;
    return { topic: "ar_overdue", severity: "Warning", title: `${customers.get(worst[0])} owes ${usd(worst[1].bal)}`,
      finding: `The oldest open invoice is ${worst[1].days} days past due.`, recommendation: `Call this week; require payment before the next job or delivery.`,
      metrics: { balance: Number(worst[1].bal) / 100, days_past_due: worst[1].days }, sources: ["ar_invoices"] };
  });
  run(() => {
    const paid = invoices.filter((i) => i.paidAt);
    const byCust = new Map<string, { y: number; d: number }[]>();
    for (const i of paid) byCust.set(i.customerId, [...(byCust.get(i.customerId) ?? []), { y: i.issuedAt.getUTCFullYear(), d: (i.paidAt!.getTime() - i.issuedAt.getTime()) / 86_400_000 }]);
    let worst: { c: string; a: number; b: number } | null = null;
    for (const [c, xs] of byCust) {
      const ys = [...new Set(xs.map((x) => x.y))].sort(); if (ys.length < 2) continue;
      const avg = (y: number) => { const v = xs.filter((x) => x.y === y).map((x) => x.d); return v.reduce((p, q) => p + q, 0) / v.length; };
      const a = avg(ys[0]!), b = avg(ys[ys.length - 1]!);
      if (b - a >= 20 && (!worst || b - a > worst.b - worst.a)) worst = { c, a, b };
    }
    if (!worst) return null;
    return { topic: "slow_payer", severity: "Warning", title: `${customers.get(worst.c)} keeps paying later`,
      finding: `Average days to pay went from ${Math.round(worst.a)} to ${Math.round(worst.b)}.`, recommendation: `Tighten terms or ask for payment on delivery.`,
      metrics: { days_first: worst.a, days_last: worst.b }, sources: ["ar_invoices"] };
  });
  run(() => {
    const r = yearRange(lastFull, cutoff);
    const rev = txns.filter((t) => t.account.section === "REV" && t.date > r.from && t.date <= r.to && t.customerId);
    const res: Insight[] = [];
    const scopes = [{ label: "revenue", rows: rev }, ...ent.enterprises.map((e) => ({ label: `${name.get(e.id)} revenue`, rows: rev.filter((t) => t.enterpriseId === e.id) }))];
    for (const s of scopes) {
      const total = s.rows.reduce((a, t) => a + t.amountCents, 0n); if (total < 2_000_000n) continue;
      const by = new Map<string, bigint>(); for (const t of s.rows) by.set(t.customerId!, (by.get(t.customerId!) ?? 0n) + t.amountCents);
      const top = [...by.entries()].sort((a, b) => Number(b[1] - a[1]))[0]!;
      const share = Number(top[1]) / Number(total);
      const leases = txns.some((t) => t.customerId === top[0] && ["4100", "4110"].includes(t.account.code));
      if (share >= 0.25 && share < 0.95 && by.size >= 3) res.push({ topic: "customer_concentration", severity: "Watch",
        title: leases ? `One customer is both the biggest buyer and the tenant` : `${pct(share)} of ${s.label.toLowerCase()} comes from one customer`,
        finding: `${customers.get(top[0])} accounted for ${usd(top[1])} of ${usd(total)} ${s.label.toLowerCase()} in ${lastFull}.`,
        recommendation: `Add buyers so losing one account doesn't sink the year.`, metrics: { top_customer_share: share }, sources: ["transactions", "customers"] });
    }
    return res.sort((a, b) => Number(b.metrics.top_customer_share) - Number(a.metrics.top_customer_share)).slice(0, 1);
  });

  // --- government, accrual quality, bad years ---
  run(() => {
    const aid = spend(lastFull, (t) => t.account.code === "4210") * -1n;
    const ni = incomeStatement(inputs.rows, yearRange(lastFull, cutoff).from, yearRange(lastFull, cutoff).to).netIncomeOperatingCents;
    if (aid <= 0n || ni <= 0n || Number(aid) / Number(ni) < 0.2) return null;
    return { topic: "government_dependence", severity: "Watch", title: `Government payments supplied ${pct(Number(aid) / Number(ni))} of ${lastFull} profit`,
      finding: `${usd(aid)} of program payments against ${usd(ni)} net income.`, recommendation: `Budget without ad-hoc aid; treat it as a bonus when it comes.`,
      metrics: { program_payments: Number(aid) / 100, net_income: Number(ni) / 100 }, sources: ["transactions"] };
  });
  run(() => {
    const ys = years.slice(-2); if (ys.length < 2) return null;
    let val = 0n, nfi = 0n;
    for (const y of ys) { const r = yearRange(y, cutoff); const is = incomeStatement(inputs.rows, r.from, r.to); val += is.livestockChangeCents + is.inventoryChangeCents; nfi += is.netFarmIncomeCents; }
    if (nfi <= 0n || Number(val) / Number(nfi) < 0.4) return null;
    return { topic: "revaluation_share", severity: "Watch", title: `Much of the profit is the herd and inventory revaluing upward`,
      finding: `${usd(val)} of ${usd(nfi)} net farm income in ${ys.join("-")} came from value changes, not cash sales.`,
      recommendation: `Plan spending on operating income; value gains reverse when prices fall.`, metrics: { value_change: Number(val) / 100, nfi: Number(nfi) / 100 }, sources: ["income_statement", "balance_sheet"] };
  });
  run(() => {
    const nfi = years.map((y) => ({ y, v: incomeStatement(inputs.rows, yearRange(y, cutoff).from, yearRange(y, cutoff).to).netFarmIncomeCents }));
    const worst = nfi.reduce((a, b) => (b.v < a.v ? b : a));
    if (worst.v >= 0n || !nfi.some((x) => x.v > 0n)) return null;
    const feed = (y: number) => spend(y, (t) => ["5070", "5071", "5072"].includes(t.account.code));
    const newLoan = liabilities.find((l) => l.originatedAt && l.originatedAt.getUTCFullYear() === worst.y + 1 && l.type !== "OPERATING_LINE");
    return { topic: "bad_year", severity: "Warning", title: `${worst.y} cost a year of profit${newLoan ? " and a term loan" : ""}`,
      finding: `Net farm income was ${usd(worst.v)} in ${worst.y}; feed cost ${usd(feed(worst.y))} vs ${usd(feed(lastFull))} in ${lastFull}.${newLoan ? ` A ${usd(newLoan.originalCents)} term loan followed.` : ""}`,
      recommendation: `Write down the plan for the next bad year now: destock triggers, feed contracts, a cash reserve.`,
      metrics: Object.fromEntries(nfi.map((x) => [String(x.y), Number(x.v) / 100])), sources: ["income_statement", "transactions", "loans"] };
  });

  // --- livestock ---
  run(() => {
    const xs = processed.map((p) => p.data as Record<string, number>).filter((d) => Number.isFinite(Number(d.gross_profit_per_animal)) && Number(d.calf_transfer_value) > 0);
    if (xs.length < 3) return null;
    const gp = xs.reduce((a, d) => a + Number(d.gross_profit_per_animal), 0) / xs.length;
    return { topic: "value_added", severity: "Opportunity", title: `Selling finished beef earns about ${usd(gp)} a head more than selling the calf`,
      finding: `Across ${xs.length} processed animals, gross profit averaged ${usd(gp)} a head after charging each calf at its market value.`,
      recommendation: `Grow this as far as processor slots and your time allow.`, metrics: { avg_gross_profit: gp, head: xs.length }, sources: ["processed_animal_economics"] };
  });
  run(() => {
    const graded = animals.filter((a) => a.grade && a.salePriceCents);
    const by = new Map<string, number[]>(); for (const a of graded) by.set(a.grade!, [...(by.get(a.grade!) ?? []), Number(a.salePriceCents) / 100]);
    const avgs = [...by.entries()].filter(([, v]) => v.length >= 3).map(([g, v]) => ({ g, avg: v.reduce((a, b) => a + b, 0) / v.length })).sort((a, b) => b.avg - a.avg);
    if (avgs.length < 2 || avgs[0]!.avg < avgs[1]!.avg * 1.5) return null;
    return { topic: "price_tier", severity: "Positive", title: `${avgs[0]!.g} animals sell for ${(avgs[0]!.avg / avgs[1]!.avg).toFixed(1)}x the ${avgs[1]!.g.toLowerCase()} price`,
      finding: `Average sale: ${avgs.map((x) => `${x.g} ${usd(x.avg)}`).join(", ")}.`, recommendation: `Put selection and development effort where it lifts animals into the top grade.`,
      metrics: Object.fromEntries(avgs.map((x) => [x.g, Math.round(x.avg)])), sources: ["animals", "bull_sales"] };
  });
  run(() => {
    if (repro.length < 2) return null;
    const v = repro.map((r) => ({ y: r.year, d: r.data as Record<string, number> }));
    const drops = v.slice(1).filter((x, i) => (Number(v[i]!.d.conception_rate) - Number(x.d.conception_rate) >= 0.04) || (Number(v[i]!.d.calf_survival) - Number(x.d.calf_survival) >= 0.04));
    if (!drops.length) return null;
    return { topic: "reproduction", severity: "Watch", title: `Reproduction slipped in ${drops.map((d) => d.y).join(" and ")}`,
      finding: v.map((x) => `${x.y}: conception ${pct(Number(x.d.conception_rate))}, survival ${pct(Number(x.d.calf_survival))}`).join("; ") + ".",
      recommendation: `Review bull fertility testing, cow condition at breeding, and calving supervision.`, metrics: Object.fromEntries(v.map((x) => [String(x.y), Number(x.d.conception_rate)])), sources: ["reproduction_metrics"] };
  });
  run(() => {
    const latest = new Map<string, (typeof bullVals)[number]>(); for (const b of bullVals) if (!latest.has(b.animalId) && b.asOf <= cutoff) latest.set(b.animalId, b);
    const old = [...latest.values()].filter((b) => Number(b.ageYears ?? 0) >= 9).sort((a, b) => Number(b.ageYears) - Number(a.ageYears))[0];
    if (!old) return null;
    const snap = semenSnaps.find((x) => old.name && x.item.includes(old.name));
    const straws = old.strawsOnHand ?? (snap ? Number(snap.quantity) : 0);
    if (!straws) return null;
    old.strawsOnHand = straws;
    return { topic: "sire_risk", severity: "Warning", title: `Too much semen tied to an aging sire`,
      finding: `${old.name ?? "The senior sire"} is ${Number(old.ageYears).toFixed(1)} years old with ${old.strawsOnHand.toLocaleString()} straws on hand; estimated value ${usd(old.marketValueCents)}.`,
      recommendation: `Slow collection on the older sire, market the inventory, and plan his successor.`, metrics: { straws: old.strawsOnHand, value: Number(old.marketValueCents) / 100 }, sources: ["prize_bull_valuations", "semen_log"] };
  });
  return out;
}
