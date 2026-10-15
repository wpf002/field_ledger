"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@fl/db";
import { getDemoFarmId, getCurrentRole, canWrite } from "@/lib/data";

const pct = (v: FormDataEntryValue | null) => { const n = Number(v); return Number.isFinite(n) ? Math.max(-0.9, Math.min(2, n / 100)) : 0; };

/** Save the reserve target and scenario drivers (owners/admins/members only). */
export async function saveForecastSettings(form: FormData) {
  const farmId = await getDemoFarmId();
  if (!canWrite(await getCurrentRole())) return;
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
  if (!canWrite(await getCurrentRole())) return;
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
