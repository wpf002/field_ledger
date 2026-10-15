import crypto from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma, hashPassword } from "@fl/db";
import { hasFeature } from "@fl/core";
import { verifyToken, tokenFromRequest, roleForFarm } from "../lib/session.js";
import { planFor } from "../lib/plan.js";

/**
 * Users and permissions (Business plan): owners and admins invite people by link with
 * a role (Admin, Member, Accountant, Viewer), change roles, and remove access. Acreflow
 * doesn't send email; the owner shares the link.
 */
const ROLES = ["ADMIN", "MEMBER", "ACCOUNTANT", "VIEWER"] as const;
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const webUrl = () => (process.env.PUBLIC_WEB_URL || process.env.WEB_ORIGIN || "http://localhost:3000").replace(/\/$/, "");

async function admin(req: FastifyRequest, reply: FastifyReply, farmId: string) {
  const v = verifyToken(tokenFromRequest(req));
  const role = v ? await roleForFarm(v.userId, farmId) : null;
  if (role !== "OWNER" && role !== "ADMIN") { reply.code(403).send({ message: "Only owners and admins manage users." }); return null; }
  return { userId: v!.userId, role };
}

export async function registerMembers(app: FastifyInstance) {
  app.get("/farms/:farmId/members", async (req) => {
    const { farmId } = req.params as { farmId: string };
    const [members, invites] = await Promise.all([
      prisma.membership.findMany({ where: { farmId }, include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { role: "asc" } }),
      prisma.invite.findMany({ where: { farmId, acceptedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } }),
    ]);
    return { members: members.map((m) => ({ userId: m.userId, name: m.user.name, email: m.user.email, role: m.role })), invites: invites.map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expiresAt })) };
  });

  app.post("/farms/:farmId/invites", async (req, reply) => {
    const { farmId } = req.params as { farmId: string };
    const a = await admin(req, reply, farmId); if (!a) return;
    if (!hasFeature(await planFor(farmId), "multiple_users")) return reply.code(403).send({ message: "More users are on the Business plan." });
    const p = z.object({ email: z.string().email().max(200), role: z.enum(ROLES) }).safeParse(req.body);
    if (!p.success) return reply.badRequest("A valid email and role are required.");
    const email = p.data.email.toLowerCase();
    const existing = await prisma.membership.findFirst({ where: { farmId, user: { email } } });
    if (existing) return reply.badRequest("That person already has access.");
    const token = crypto.randomBytes(24).toString("base64url");
    const inv = await prisma.invite.create({ data: { farmId, email, role: p.data.role, tokenHash: sha(token), invitedBy: a.userId, expiresAt: new Date(Date.now() + 14 * 86_400_000) } });
    await prisma.auditLog.create({ data: { farmId, actorId: a.userId, action: "create", entity: "Invite", entityId: inv.id, after: { email, role: p.data.role } } });
    return reply.code(201).send({ id: inv.id, url: `${webUrl()}/invite/${token}` });
  });

  app.delete("/farms/:farmId/invites/:id", async (req, reply) => {
    const { farmId, id } = req.params as { farmId: string; id: string };
    if (!(await admin(req, reply, farmId))) return;
    await prisma.invite.deleteMany({ where: { id, farmId, acceptedAt: null } });
    return reply.code(204).send();
  });

  app.put("/farms/:farmId/members/:userId", async (req, reply) => {
    const { farmId, userId } = req.params as { farmId: string; userId: string };
    const a = await admin(req, reply, farmId); if (!a) return;
    const p = z.object({ role: z.enum(ROLES) }).safeParse(req.body);
    if (!p.success) return reply.badRequest("Pick a role.");
    const m = await prisma.membership.findUnique({ where: { userId_farmId: { userId, farmId } } });
    if (!m || m.role === "OWNER") return reply.badRequest("The owner's role can't be changed here.");
    await prisma.membership.update({ where: { id: m.id }, data: { role: p.data.role } });
    await prisma.auditLog.create({ data: { farmId, actorId: a.userId, action: "update", entity: "Membership", entityId: m.id, before: { role: m.role }, after: { role: p.data.role } } });
    return { ok: true };
  });

  app.delete("/farms/:farmId/members/:userId", async (req, reply) => {
    const { farmId, userId } = req.params as { farmId: string; userId: string };
    const a = await admin(req, reply, farmId); if (!a) return;
    const m = await prisma.membership.findUnique({ where: { userId_farmId: { userId, farmId } } });
    if (!m || m.role === "OWNER") return reply.badRequest("The owner can't be removed.");
    await prisma.membership.delete({ where: { id: m.id } });
    // Their API and connector tokens for this farm stop working too.
    await prisma.apiToken.updateMany({ where: { userId, farmId, revokedAt: null }, data: { revokedAt: new Date() } });
    await prisma.auditLog.create({ data: { farmId, actorId: a.userId, action: "delete", entity: "Membership", entityId: m.id, before: { userId, role: m.role } } });
    return reply.code(204).send();
  });

  // ---------- accepting (no farm session needed) ----------
  const find = async (token: string) => {
    const inv = await prisma.invite.findUnique({ where: { tokenHash: sha(token) }, include: { farm: { select: { name: true } } } });
    return inv && !inv.acceptedAt && inv.expiresAt > new Date() ? inv : null;
  };
  app.get("/invites/:token", async (req, reply) => {
    const inv = await find((req.params as { token: string }).token);
    if (!inv) return reply.notFound("This invitation is invalid or expired.");
    const user = await prisma.user.findUnique({ where: { email: inv.email }, select: { passwordHash: true } });
    return { farm: inv.farm.name, email: inv.email, role: inv.role, hasAccount: !!user?.passwordHash };
  });
  app.post("/invites/:token/accept", async (req, reply) => {
    const inv = await find((req.params as { token: string }).token);
    if (!inv) return reply.notFound("This invitation is invalid or expired.");
    const user = await prisma.user.findUnique({ where: { email: inv.email } });
    let userId: string;
    if (user?.passwordHash) {
      // Existing account: accept only while signed in as that person.
      const v = verifyToken(tokenFromRequest(req));
      if (!v || v.userId !== user.id) return reply.code(401).send({ message: "Sign in as the invited email to accept." });
      userId = user.id;
    } else {
      const p = z.object({ name: z.string().min(1).max(100), password: z.string().min(8).max(200) }).safeParse(req.body);
      if (!p.success) return reply.badRequest("Enter your name and a password of at least 8 characters.");
      userId = user
        ? (await prisma.user.update({ where: { id: user.id }, data: { name: p.data.name, passwordHash: hashPassword(p.data.password) } })).id
        : (await prisma.user.create({ data: { email: inv.email, name: p.data.name, passwordHash: hashPassword(p.data.password) } })).id;
    }
    await prisma.membership.upsert({ where: { userId_farmId: { userId, farmId: inv.farmId } }, update: { role: inv.role }, create: { userId, farmId: inv.farmId, role: inv.role } });
    await prisma.invite.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } });
    await prisma.auditLog.create({ data: { farmId: inv.farmId, actorId: userId, action: "create", entity: "Membership", entityId: userId, after: { role: inv.role, via: "invite" } } });
    return { ok: true, email: inv.email };
  });
}
