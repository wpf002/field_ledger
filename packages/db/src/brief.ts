import type { PrismaClient } from "@prisma/client";
import {
  financialRatios, ratioInputsFor, periodFor, healthScore, incomeStatement, enterpriseStatements, lineDetail,
} from "@fl/core";
import { forecastContext } from "./forecast-context.js";
import { generateInsights } from "./insights.js";
import { loadCommodityExposure } from "./marketing.js";

/**
 * Weekly / monthly financial brief (spec §29). Plain statements, each with the
 * records it came from; actions point at a specific invoice, cost line, or crop.
 */
export type BriefLine = { text: string; sources: string[] };
export type Brief = { kind: "weekly" | "monthly"; asOf: Date; score: number; status: string; lines: BriefLine[]; actions: BriefLine[] };

const usd = (c: bigint | number) => { const n = typeof c === "bigint" ? Number(c) / 100 : c; return `${n < 0 ? "-" : ""}$${Math.round(Math.abs(n)).toLocaleString("en-US")}`; };
const pct = (x: number) => `${Math.round(Math.abs(x) * 100)}%`;
const monthName = (d: Date) => d.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
const dayName = (d: Date) => d.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });

export async function generateBrief(prisma: PrismaClient, farmId: string, kind: "weekly" | "monthly" = "weekly", ctxIn?: Awaited<ReturnType<typeof forecastContext>>): Promise<Brief> {
  const ctx = ctxIn ?? (await forecastContext(prisma, farmId));
  const { asOf, inputs } = ctx;
  const ratios = financialRatios(ratioInputsFor(inputs, periodFor("ttm", asOf), inputs.ownerLaborAnnualCents));
  const health = healthScore(ratios, inputs.loans.some((l) => !l.isLine && l.schedule.length > 0));
  const lines: BriefLine[] = [{ text: `Financial health: ${health.status} (${health.overall}/100).`, sources: ["financial_ratios"] }];
  const actions: BriefLine[] = [];

  // Cash against the reserve.
  const weeks = ctx.thirteen("base"), months = ctx.twelve("base");
  if (weeks.reserveBreach) {
    lines.push({ text: `Cash is projected to fall below your ${usd(ctx.reserveCents)} reserve the week of ${dayName(weeks.reserveBreach.start)}.`, sources: ["cash_forecast_13_week"] });
  } else {
    const breach = months.find((m) => m.cash.endingCashCents - m.cash.drawsCents + m.cash.repaymentsCents < ctx.reserveCents);
    const through = breach ? months[Math.max(0, months.indexOf(breach) - 1)]!.monthEnd : months[months.length - 1]!.monthEnd;
    lines.push({ text: `Cash is projected to stay above your ${usd(ctx.reserveCents)} reserve through ${monthName(through)}.`, sources: ["forecast_12_month"] });
  }

  // Last month (monthly brief) or year to date (both).
  const ytd = periodFor("ytd", asOf), pytd = periodFor("ytd", new Date(Date.UTC(asOf.getUTCFullYear() - 1, asOf.getUTCMonth(), 1)));
  if (kind === "monthly") {
    const m = periodFor("month", asOf), pm = periodFor("month", new Date(Date.UTC(asOf.getUTCFullYear() - 1, asOf.getUTCMonth(), 1)));
    const a = incomeStatement(inputs.rows, m.from, m.to), b = incomeStatement(inputs.rows, pm.from, pm.to);
    lines.push({ text: `${monthName(asOf)}: revenue ${usd(a.revenueCents)} and net income ${usd(a.netIncomeOperatingCents)}, vs ${usd(b.revenueCents)} and ${usd(b.netIncomeOperatingCents)} a year ago.`, sources: ["income_statement"] });
  }

  // Revenue against plan.
  const plans = await prisma.enterpriseBudget.findMany({ where: { farmId, year: asOf.getUTCFullYear(), enterpriseId: null } });
  const plan = plans.find((p) => p.period.startsWith("YTD")) ?? plans.find((p) => p.period === "Full year");
  const isYtd = incomeStatement(inputs.rows, ytd.from, ytd.to);
  if (plan) {
    const d = isYtd.revenueCents - plan.plannedRevenueCents;
    lines.push({ text: `Revenue is ${usd(d < 0n ? -d : d)} ${d >= 0n ? "above" : "below"} plan year to date (${usd(isYtd.revenueCents)} vs ${usd(plan.plannedRevenueCents)}).`, sources: ["budget_vs_actual", "income_statement"] });
  }

  // The cost line growing fastest vs the same period last year.
  const now = [...lineDetail(inputs.rows, "COP", ytd.from, ytd.to), ...lineDetail(inputs.rows, "OVH", ytd.from, ytd.to)];
  const prior = new Map([...lineDetail(inputs.rows, "COP", pytd.from, pytd.to), ...lineDetail(inputs.rows, "OVH", pytd.from, pytd.to)].map((l) => [l.line, l.cents]));
  const growth = now.map((l) => ({ line: l.line, cents: l.cents, prev: prior.get(l.line) ?? 0n })).filter((x) => x.prev >= 200_000n && x.cents > x.prev)
    .map((x) => ({ ...x, g: Number(x.cents) / Number(x.prev) - 1 })).sort((a, b) => b.g - a.g)[0];
  if (growth && growth.g >= 0.1) {
    lines.push({ text: `${growth.line} costs are ${pct(growth.g)} above the same period last year (${usd(growth.cents)} vs ${usd(growth.prev)}).`, sources: ["transactions"] });
    actions.push({ text: `Review ${growth.line.toLowerCase()} spending.`, sources: ["transactions"] });
  }

  // Lowest-margin enterprise this year.
  const st = enterpriseStatements(inputs.rows, ytd.from, ytd.to);
  const names = new Map((await prisma.enterprise.findMany({ where: { farmId } })).map((e) => [e.id, e.name.split(" (")[0]!]));
  // Margin on everything the enterprise produced, including animals passed to other enterprises.
  const margin = (s: (typeof st extends Map<unknown, infer V> ? V : never)) => { const base = s.revenueCents + (s.transfersCents > 0n ? s.transfersCents : 0n); return base > 0n ? Number(s.grossProfitCents) / Number(base) : null; };
  const low = [...st.entries()].filter(([id, s]) => id && s.revenueCents > isYtd.revenueCents / 20n && margin(s) != null).sort((a, b) => margin(a[1])! - margin(b[1])!)[0];
  if (low) lines.push({ text: `${names.get(low[0]!)} has the lowest gross margin this year (${Math.round(margin(low[1])! * 100)}%).`, sources: ["income_statement_by_enterprise"] });

  // Operating line peak.
  if (ctx.lineTerms) {
    const peak = months.reduce((a, m) => (m.cash.lineBalanceCents > a.cash.lineBalanceCents ? m : a), months[0]!);
    if (peak.cash.lineBalanceCents > 0n) lines.push({ text: `Your operating line is projected to peak at ${usd(peak.cash.lineBalanceCents)} in ${monthName(peak.monthEnd)} (limit ${usd(ctx.lineTerms.limitCents)}).`, sources: ["forecast_12_month", "loans"] });
  }

  // Actions: largest overdue invoice, delay purchases on a reserve breach, unpriced crop, then top risk.
  const overdue = (await prisma.invoice.findMany({ where: { farmId, status: { not: "PAID" }, dueAt: { lt: asOf } }, include: { customer: true } }))
    .map((i) => ({ i, bal: i.totalCents - i.amountPaidCents })).sort((a, b) => Number(b.bal - a.bal))[0];
  if (overdue && overdue.bal >= 50_000n) actions.unshift({ text: `Collect the outstanding ${usd(overdue.bal)} invoice from ${overdue.i.customer.name} (due ${dayName(overdue.i.dueAt)}).`, sources: ["ar_invoices"] });
  if (weeks.reserveBreach) actions.push({ text: `Hold discretionary purchases until cash recovers after the week of ${dayName(weeks.reserveBreach.start)}.`, sources: ["cash_forecast_13_week"] });
  // Most exposed crop by unpriced value: what's still to sell after sales and priced contracts.
  const exposure = await loadCommodityExposure(prisma, farmId, asOf);
  const unpriced = exposure.rows.filter((r) => r.exposedPct != null && r.exposedPct >= 0.4 && r.unpriced > 0)
    .sort((a, b) => (b.unpricedValue ?? b.unpriced) - (a.unpricedValue ?? a.unpriced))[0];
  if (unpriced) actions.push({ text: `Consider locking pricing on part of the ${unpriced.cropYear} ${unpriced.commodity.toLowerCase()} crop; ${pct(unpriced.exposedPct!)} of expected production is unpriced${unpriced.unpricedValue ? ` (${usd(BigInt(Math.round(unpriced.unpricedValue * 100)))} at today's price)` : ""}.`, sources: ["crop_seasons", "marketing_contracts"] });
  const top = (await generateInsights(prisma, farmId)).find((i) => i.severity === "Critical" || i.severity === "Warning");
  if (top) actions.push({ text: top.recommendation, sources: top.sources });

  return { kind, asOf, score: health.overall, status: health.status, lines, actions: actions.slice(0, 4) };
}
