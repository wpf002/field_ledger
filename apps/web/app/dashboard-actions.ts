"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@fl/db";
import { hasFeature } from "@fl/core";
import { getCurrentFarm } from "@/lib/session";

/** Save this user's dashboard tiles for the current farm (Business). Empty resets to the default strip. */
export async function saveDashboardTiles(keys: string[]) {
  const c = await getCurrentFarm();
  if (!c || !hasFeature(c.farm.plan, "custom_dashboard")) return;
  const clean = keys.filter((k) => /^[a-zA-Z0-9]{1,30}$/.test(k)).slice(0, 24);
  await prisma.membership.update({ where: { userId_farmId: { userId: c.user.id, farmId: c.farm.id } }, data: { dashboardTiles: clean } });
  revalidatePath("/");
}
