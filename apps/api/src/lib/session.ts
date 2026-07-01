import crypto from "node:crypto";
import { prisma } from "@fl/db";

/** Same signing scheme as the web app so one token authorizes both. Read at
 *  call time so it reflects the loaded .env regardless of import order. */
const secret = () => process.env.AUTH_SECRET || "insecure-dev-secret";

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

export function bearer(authorization?: string): string | undefined {
  return authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
}

/** Session token from the httpOnly cookie (the same-origin proxy forwards it),
 *  falling back to a Bearer header for direct/API-test callers. */
export function tokenFromRequest(req: { cookies?: Record<string, string | undefined>; headers: { authorization?: string } }): string | undefined {
  return req.cookies?.fl_token ?? bearer(req.headers.authorization);
}

export async function roleForFarm(userId: string, farmId: string) {
  const m = await prisma.membership.findUnique({ where: { userId_farmId: { userId, farmId } } });
  return m?.role ?? null;
}
