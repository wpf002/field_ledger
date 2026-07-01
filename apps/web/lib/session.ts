import crypto from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@fl/db";

/**
 * Phase 8 session layer (server-only). A session is an HMAC-signed
 * {userId, exp} token, verified with AUTH_SECRET. The same algorithm runs in
 * the API (apps/api/src/lib/session.ts) so one token authorizes both.
 * Note: the cookie is readable by client JS so the fetch interceptor can attach
 * it to API calls — acceptable for this demo; production would use httpOnly +
 * a same-origin API.
 */
const secret = () => process.env.AUTH_SECRET || "insecure-dev-secret";
export const TOKEN_COOKIE = "fl_token";
export const FARM_COOKIE = "fl_farm";

export function signToken(userId: string, ttlDays = 30): string {
  const payload = Buffer.from(JSON.stringify({ userId, exp: Date.now() + ttlDays * 86_400_000 })).toString("base64url");
  const sig = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyToken(token?: string): { userId: string } | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const { userId, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!userId || (exp && Date.now() > exp)) return null;
    return { userId };
  } catch {
    return null;
  }
}

export async function getSession() {
  const v = verifyToken(cookies().get(TOKEN_COOKIE)?.value);
  if (!v) return null;
  const user = await prisma.user.findUnique({ where: { id: v.userId }, include: { memberships: { include: { farm: true }, orderBy: { farm: { name: "asc" } } } } });
  if (!user || user.memberships.length === 0) return null;
  return { user, memberships: user.memberships };
}

/** Current farm from the fl_farm cookie (intersected with the user's
 *  memberships) or the first membership. Returns null if unauthenticated. */
export async function getCurrentFarm() {
  const s = await getSession();
  if (!s) return null;
  const wanted = cookies().get(FARM_COOKIE)?.value;
  const m = s.memberships.find((x) => x.farmId === wanted) ?? s.memberships[0]!;
  return { farm: m.farm, role: m.role, user: s.user, memberships: s.memberships };
}
