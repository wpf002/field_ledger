import type { FastifyInstance, FastifyRequest } from "fastify";
import { prisma, registerClient, exchangeCode, refreshGrant, OAuthError } from "@fl/db";

/**
 * OAuth discovery and token endpoints for the MCP server (MCP authorization spec:
 * RFC 9728 protected-resource metadata, RFC 8414 server metadata, RFC 7591 dynamic
 * registration). The consent screen lives in the web app at /oauth/authorize.
 * Everything is served under the web origin; /.well-known is rewritten to the API.
 */
export const publicOrigin = () => (process.env.PUBLIC_WEB_URL || process.env.WEB_ORIGIN || "http://localhost:3000").replace(/\/$/, "");
export const resourceUrl = () => `${publicOrigin()}/api/mcp`;
export const resourceMetadataUrl = () => `${publicOrigin()}/.well-known/oauth-protected-resource/api/mcp`;

const protectedResource = () => ({
  resource: resourceUrl(), authorization_servers: [publicOrigin()], scopes_supported: ["read", "analyze"],
  bearer_methods_supported: ["header"], resource_name: "Acreflow",
});
const serverMetadata = () => ({
  issuer: publicOrigin(),
  authorization_endpoint: `${publicOrigin()}/oauth/authorize`,
  token_endpoint: `${publicOrigin()}/api/oauth/token`,
  registration_endpoint: `${publicOrigin()}/api/oauth/register`,
  response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["none"], scopes_supported: ["read", "analyze"],
});

const bodyOf = (req: FastifyRequest) => (req.body ?? {}) as Record<string, string | undefined>;

export async function registerOAuth(app: FastifyInstance) {
  // Token requests arrive form-encoded.
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_req, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(body as string)));
  });

  for (const path of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/api/mcp"]) app.get(path, async () => protectedResource());
  for (const path of ["/.well-known/oauth-authorization-server", "/.well-known/openid-configuration"]) app.get(path, async () => serverMetadata());

  app.post("/oauth/register", async (req, reply) => {
    try { return reply.code(201).send(await registerClient(prisma, bodyOf(req))); }
    catch (e) { return reply.code(400).send({ error: e instanceof OAuthError ? e.code : "invalid_client_metadata", error_description: e instanceof Error ? e.message : "invalid" }); }
  });

  app.post("/oauth/token", async (req, reply) => {
    const b = bodyOf(req);
    reply.header("Cache-Control", "no-store");
    try {
      if (b.grant_type === "authorization_code") return await exchangeCode(prisma, b);
      if (b.grant_type === "refresh_token") return await refreshGrant(prisma, b);
      return reply.code(400).send({ error: "unsupported_grant_type" });
    } catch (e) {
      return reply.code(400).send({ error: e instanceof OAuthError ? e.code : "invalid_request", error_description: e instanceof Error ? e.message : "invalid" });
    }
  });
}
