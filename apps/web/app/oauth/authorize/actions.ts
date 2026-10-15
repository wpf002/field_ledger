"use server";
import { redirect } from "next/navigation";
import { prisma, findClient, createCode, parseScope } from "@fl/db";
import { getCurrentFarm } from "@/lib/session";

/** Approve or deny an MCP connector's request; either way, send the user back to the client. */
export async function decide(form: FormData) {
  const s = await getCurrentFarm();
  if (!s) redirect("/login");
  const clientId = String(form.get("client_id")), redirectUri = String(form.get("redirect_uri")), state = String(form.get("state") ?? "");
  const client = await findClient(prisma, clientId, redirectUri);
  if (!client) redirect("/oauth/authorize?error=invalid_client");
  const back = new URL(redirectUri);
  if (state) back.searchParams.set("state", state);
  if (form.get("decision") !== "allow") {
    back.searchParams.set("error", "access_denied");
    redirect(back.toString());
  }
  const farmId = String(form.get("farm_id"));
  const membership = s.memberships.find((m) => m.farmId === farmId);
  if (!membership) redirect("/oauth/authorize?error=farm");
  const scope = membership.role === "VIEWER" ? "read" : parseScope(String(form.get("scope")));
  const code = await createCode(prisma, { clientId, userId: s.user.id, farmId, scope, redirectUri, codeChallenge: String(form.get("code_challenge")) });
  await prisma.auditLog.create({ data: { farmId, actorId: s.user.id, action: "create", entity: "OAuthGrant", entityId: clientId, after: { client: client.name, scope } } });
  back.searchParams.set("code", code);
  redirect(back.toString());
}
