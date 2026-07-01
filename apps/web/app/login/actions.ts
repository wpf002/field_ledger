"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@fl/db";
import { signToken, TOKEN_COOKIE, FARM_COOKIE } from "@/lib/session";

const cookieOpts = { path: "/", sameSite: "lax" as const, maxAge: 30 * 86_400 };

export async function login(email: string): Promise<{ error?: string }> {
  const user = await prisma.user.findUnique({ where: { email }, include: { memberships: true } });
  if (!user || user.memberships.length === 0) return { error: "No account for that email." };
  const c = cookies();
  c.set(TOKEN_COOKIE, signToken(user.id), cookieOpts); // not httpOnly — client interceptor reads it
  c.set(FARM_COOKIE, user.memberships[0]!.farmId, cookieOpts);
  redirect("/");
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
