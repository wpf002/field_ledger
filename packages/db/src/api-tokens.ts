import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

const hash = (t: string) => createHash("sha256").update(t).digest("hex");

/** Create a token; the plaintext is returned once and never stored. */
export async function createApiToken(prisma: PrismaClient, o: { userId: string; farmId: string; name: string; scope: "read" | "analyze" }) {
  const token = `afk_${randomBytes(24).toString("base64url")}`;
  const rec = await prisma.apiToken.create({ data: { userId: o.userId, farmId: o.farmId, name: o.name, scope: o.scope, prefix: token.slice(0, 10), tokenHash: hash(token) } });
  return { token, id: rec.id };
}

/** Resolve a bearer token to its farm and scope; the user must still be a member of the farm. */
export async function verifyApiToken(prisma: PrismaClient, token: string | undefined) {
  if (!token?.startsWith("afk_")) return null;
  const rec = await prisma.apiToken.findUnique({ where: { tokenHash: hash(token) } });
  if (!rec || rec.revokedAt) return null;
  const member = await prisma.membership.findUnique({ where: { userId_farmId: { userId: rec.userId, farmId: rec.farmId } } });
  if (!member) return null;
  await prisma.apiToken.update({ where: { id: rec.id }, data: { lastUsedAt: new Date() } });
  // Viewers can hold read tokens only.
  const scope = member.role === "VIEWER" ? "read" : (rec.scope as "read" | "analyze");
  return { tokenId: rec.id, userId: rec.userId, farmId: rec.farmId, scope };
}
