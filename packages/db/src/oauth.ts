import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

/**
 * OAuth 2.1 authorization server for the MCP endpoint: dynamic client
 * registration, authorization code + PKCE (S256 only), rotating refresh tokens.
 * Access tokens are short-lived ApiTokens, so /mcp and /v1 verify them the same way.
 */
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const b64url = (b: Buffer) => b.toString("base64url");
export const ACCESS_TTL_S = 3600;
const REFRESH_TTL_MS = 30 * 86_400_000;
const CODE_TTL_MS = 5 * 60_000;
export type OAuthScope = "read" | "analyze";
export const parseScope = (s: string | null | undefined): OAuthScope => (String(s ?? "").split(/\s+/).includes("analyze") ? "analyze" : "read");

export class OAuthError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

/** Only https redirects, plus loopback http for desktop clients. */
export function validRedirect(u: string) {
  try {
    const url = new URL(u);
    return url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  } catch { return false; }
}

export async function registerClient(prisma: PrismaClient, body: { redirect_uris?: unknown; client_name?: unknown }) {
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (!uris.length || !uris.every(validRedirect)) throw new OAuthError("invalid_redirect_uri", "redirect_uris must be https (or loopback http) URLs");
  const clientId = `afc_${b64url(randomBytes(18))}`;
  const name = typeof body.client_name === "string" ? body.client_name.slice(0, 100) : null;
  await prisma.oAuthClient.create({ data: { clientId, name, redirectUris: uris } });
  return { client_id: clientId, client_id_issued_at: Math.floor(Date.now() / 1000), client_name: name ?? undefined, redirect_uris: uris,
    token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] };
}

export async function findClient(prisma: PrismaClient, clientId: string, redirectUri?: string) {
  const c = await prisma.oAuthClient.findUnique({ where: { clientId } });
  if (!c) return null;
  if (redirectUri && !(c.redirectUris as string[]).includes(redirectUri)) return null;
  return c;
}

export async function createCode(prisma: PrismaClient, o: { clientId: string; userId: string; farmId: string; scope: OAuthScope; redirectUri: string; codeChallenge: string }) {
  const code = b64url(randomBytes(32));
  await prisma.oAuthCode.create({ data: { ...o, codeHash: sha(code), expiresAt: new Date(Date.now() + CODE_TTL_MS) } });
  return code;
}

async function issue(prisma: PrismaClient, o: { clientId: string; userId: string; farmId: string; scope: OAuthScope; name: string }) {
  const access = `afk_${b64url(randomBytes(24))}`, refresh = `afr_${b64url(randomBytes(32))}`;
  await prisma.apiToken.create({ data: { userId: o.userId, farmId: o.farmId, name: o.name, scope: o.scope, clientId: o.clientId, prefix: access.slice(0, 10), tokenHash: sha(access), expiresAt: new Date(Date.now() + ACCESS_TTL_S * 1000) } });
  await prisma.oAuthRefresh.create({ data: { tokenHash: sha(refresh), clientId: o.clientId, userId: o.userId, farmId: o.farmId, scope: o.scope, expiresAt: new Date(Date.now() + REFRESH_TTL_MS) } });
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: o.scope === "analyze" ? "read analyze" : "read" };
}

export async function exchangeCode(prisma: PrismaClient, p: { code?: string; client_id?: string; redirect_uri?: string; code_verifier?: string }) {
  if (!p.code || !p.client_id || !p.redirect_uri || !p.code_verifier) throw new OAuthError("invalid_request", "code, client_id, redirect_uri and code_verifier are required");
  const row = await prisma.oAuthCode.findUnique({ where: { codeHash: sha(p.code) } });
  if (!row || row.usedAt || row.expiresAt < new Date() || row.clientId !== p.client_id || row.redirectUri !== p.redirect_uri) throw new OAuthError("invalid_grant", "Authorization code is invalid or expired");
  if (b64url(createHash("sha256").update(p.code_verifier).digest()) !== row.codeChallenge) throw new OAuthError("invalid_grant", "PKCE verification failed");
  await prisma.oAuthCode.update({ where: { id: row.id }, data: { usedAt: new Date() } });
  const client = await prisma.oAuthClient.findUnique({ where: { clientId: row.clientId } });
  return issue(prisma, { clientId: row.clientId, userId: row.userId, farmId: row.farmId, scope: row.scope as OAuthScope, name: client?.name ?? "MCP connector" });
}

export async function refreshGrant(prisma: PrismaClient, p: { refresh_token?: string; client_id?: string }) {
  if (!p.refresh_token) throw new OAuthError("invalid_request", "refresh_token is required");
  const row = await prisma.oAuthRefresh.findUnique({ where: { tokenHash: sha(p.refresh_token) } });
  if (!row || row.revokedAt || row.expiresAt < new Date() || (p.client_id && p.client_id !== row.clientId)) throw new OAuthError("invalid_grant", "Refresh token is invalid or expired");
  // The member may have lost access since the grant.
  const m = await prisma.membership.findUnique({ where: { userId_farmId: { userId: row.userId, farmId: row.farmId } } });
  if (!m) throw new OAuthError("invalid_grant", "Access to this farm was removed");
  await prisma.oAuthRefresh.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
  const client = await prisma.oAuthClient.findUnique({ where: { clientId: row.clientId } });
  return issue(prisma, { clientId: row.clientId, userId: row.userId, farmId: row.farmId, scope: row.scope as OAuthScope, name: client?.name ?? "MCP connector" });
}
