"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma, verifyPassword } from "@fl/db";
import { signToken, TOKEN_COOKIE, FARM_COOKIE } from "@/lib/session";

const cookieOpts = { path: "/", sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", maxAge: 30 * 86_400 };
// The session token is httpOnly now — it's never read by client JS. API calls go
// same-origin through the Next proxy, so the browser attaches it automatically.
const tokenCookieOpts = { ...cookieOpts, httpOnly: true };

/** Same-site path to return to after sign-in; anything else falls back to the dashboard. */
const safeNext = (next?: string) => (next && next.startsWith("/") && !next.startsWith("//") ? next : "/");

export async function login(email: string, password: string, next?: string): Promise<{ error?: string }> {
  const user = await prisma.user.findUnique({ where: { email }, include: { memberships: true } });
  if (!user || user.memberships.length === 0) return { error: "No account for that email." };
  if (!verifyPassword(password, user.passwordHash)) return { error: "Incorrect email or password." };
  const c = cookies();
  c.set(TOKEN_COOKIE, signToken(user.id), tokenCookieOpts);
  c.set(FARM_COOKIE, user.memberships[0]!.farmId, cookieOpts);
  redirect(safeNext(next));
}

export async function logout() {
  const c = cookies();
  c.delete(TOKEN_COOKIE);
  c.delete(FARM_COOKIE);
  redirect("/login");
}

export async function switchFarm(farmId: string) {
  cookies().set(FARM_COOKIE, farmId, cookieOpts);
}
