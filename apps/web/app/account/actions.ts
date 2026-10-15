"use server";
import { revalidatePath } from "next/cache";
import { prisma, createApiToken } from "@fl/db";
import { getCurrentFarm } from "@/lib/session";

/** Create an API / MCP token for the current farm. The plaintext comes back once. */
export async function createToken(name: string, scope: "read" | "analyze") {
  const c = await getCurrentFarm();
  if (!c) return { error: "Sign in required." };
  const { hasFeature } = await import("@fl/core");
  if (!hasFeature(c.farm.plan, "api_access")) return { error: "API and MCP access are on the Business plan." };
  const s = c.role === "VIEWER" ? "read" : scope;
  const { token, id } = await createApiToken(prisma, { userId: c.user.id, farmId: c.farm.id, name: name.trim().slice(0, 60) || "API token", scope: s });
  await prisma.auditLog.create({ data: { farmId: c.farm.id, actorId: c.user.id, action: "create", entity: "ApiToken", entityId: id, after: { name, scope: s } } });
  revalidatePath("/account");
  return { token };
}

export async function revokeToken(id: string) {
  const c = await getCurrentFarm();
  if (!c) return;
  const t = await prisma.apiToken.findFirst({ where: { id, userId: c.user.id } });
  if (!t) return;
  await prisma.apiToken.update({ where: { id }, data: { revokedAt: new Date() } });
  await prisma.auditLog.create({ data: { farmId: t.farmId, actorId: c.user.id, action: "update", entity: "ApiToken", entityId: id, after: { revoked: true } } });
  revalidatePath("/account");
}

/** Farms sharing an entity group report together on Consolidated (owners and admins). */
export async function saveEntityGroup(form: FormData) {
  const c = await getCurrentFarm();
  if (!c || (c.role !== "OWNER" && c.role !== "ADMIN")) return;
  const group = String(form.get("entityGroup") ?? "").trim().slice(0, 80) || null;
  await prisma.farm.update({ where: { id: c.farm.id }, data: { entityGroup: group } });
  await prisma.auditLog.create({ data: { farmId: c.farm.id, actorId: c.user.id, action: "update", entity: "Farm", entityId: c.farm.id, after: { entityGroup: group } } });
  revalidatePath("/account");
}
