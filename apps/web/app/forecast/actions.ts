"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@fl/db";
import { getDemoFarmId, getCurrentRole, canManage } from "@/lib/data";

const pct = (v: FormDataEntryValue | null) => { const n = Number(v); return Number.isFinite(n) ? Math.max(-0.9, Math.min(2, n / 100)) : 0; };

/** Save the reserve target and scenario drivers (owners/admins/members only). */
export async function saveForecastSettings(form: FormData) {
  const farmId = await getDemoFarmId();
  if (!canManage(await getCurrentRole())) return;
  const reserve = Math.max(0, Math.round(Number(form.get("reserve") ?? 0) * 100));
  const scenarios = Object.fromEntries((["base", "optimistic", "downside"] as const).map((k) => [k, {
    pricePct: pct(form.get(`${k}.price`)), volumePct: pct(form.get(`${k}.volume`)), costInflationPct: pct(form.get(`${k}.cost`)),
  }]));
  const before = await prisma.forecastSetting.findUnique({ where: { farmId } });
  const after = await prisma.forecastSetting.upsert({ where: { farmId }, create: { farmId, reserveCents: BigInt(reserve), scenarios }, update: { reserveCents: BigInt(reserve), scenarios } });
  await prisma.auditLog.create({ data: { farmId, action: before ? "update" : "create", entity: "ForecastSetting", entityId: after.id, before: before ? { reserveCents: before.reserveCents.toString(), scenarios: before.scenarios ?? null } : undefined, after: { reserveCents: after.reserveCents.toString(), scenarios } } });
  revalidatePath("/forecast");
}

/** Keep this forecast so the Accuracy tab can grade it as months close. */
export async function saveForecastRun(form: FormData) {
  const farmId = await getDemoFarmId();
  if (!canManage(await getCurrentRole())) return;
  const { getForecastContext } = await import("@/lib/forecast");
  const scenario = (["base", "optimistic", "downside"] as const).find((k) => k === form.get("scenario")) ?? "base";
  const ctx = await getForecastContext(farmId);
  const months = ctx.twelve(scenario).map((m) => ({
    monthEnd: m.monthEnd.toISOString().slice(0, 10), revenueCents: m.pnl.revenueCents.toString(),
    costsCents: (m.pnl.copCents + m.pnl.overheadCents).toString(), netCents: m.pnl.netIncomeOperatingCents.toString(), endingCashCents: m.cash.endingCashCents.toString(),
  }));
  const run = await prisma.forecastRun.create({ data: { farmId, scenario, asOf: ctx.asOf, months } });
  await prisma.auditLog.create({ data: { farmId, action: "create", entity: "ForecastRun", entityId: run.id, after: { scenario, asOf: ctx.asOf.toISOString() } } });
  revalidatePath("/forecast");
}

const LIVESTOCK_KEYS = ["breedingFemales", "weaningRate", "retained", "saleWeightLb", "pricePerCwt", "cullHead", "cullPrice", "otherRevenue"] as const;

/** Save one livestock enterprise's revenue drivers (spec §8). Weaning rate is entered as a percent. */
export async function saveLivestockDrivers(form: FormData) {
  const farmId = await getDemoFarmId();
  if (!canManage(await getCurrentRole())) return;
  const enterpriseId = String(form.get("enterpriseId") ?? "");
  if (!(await prisma.enterprise.findFirst({ where: { id: enterpriseId, farmId } }))) return;
  const d: Record<string, number> = {};
  for (const k of LIVESTOCK_KEYS) {
    const n = Number(form.get(k));
    if (Number.isFinite(n) && n >= 0) d[k] = k === "weaningRate" ? Math.min(1.2, n / 100) : n;
  }
  const setting = await prisma.forecastSetting.findUnique({ where: { farmId } });
  const drivers = (setting?.revenueDrivers ?? {}) as { livestock?: Record<string, Record<string, number>> };
  const livestock = { ...(drivers.livestock ?? {}) };
  if (form.get("reset")) delete livestock[enterpriseId]; else livestock[enterpriseId] = d;
  const next = { ...drivers, livestock };
  await prisma.forecastSetting.upsert({ where: { farmId }, create: { farmId, revenueDrivers: next }, update: { revenueDrivers: next } });
  await prisma.auditLog.create({ data: { farmId, action: "update", entity: "RevenueDrivers", entityId: enterpriseId, after: d } });
  revalidatePath("/forecast");
}
