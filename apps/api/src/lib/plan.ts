import { prisma } from "@fl/db";
import { asPlan, type Plan } from "@fl/core";

/** The farm's subscription plan. */
export async function planFor(farmId: string): Promise<Plan> {
  const f = await prisma.farm.findUnique({ where: { id: farmId }, select: { plan: true } });
  return asPlan(f?.plan);
}
