import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@fl/db";
import { audit } from "../lib/audit.js";
import { verifyToken, tokenFromRequest } from "../lib/session.js";

/** Farm notes: decisions, reminders, follow-ups (written by people or, on request, the assistant). */
export async function registerNotes(app: FastifyInstance) {
  app.get("/farms/:farmId/notes", async (req) => {
    const { farmId } = req.params as { farmId: string };
    return prisma.note.findMany({ where: { farmId }, orderBy: { createdAt: "desc" }, take: 200 });
  });
  app.post("/farms/:farmId/notes", async (req, reply) => {
    const { farmId } = req.params as { farmId: string };
    const parsed = z.object({ body: z.string().min(1).max(2000), entity: z.string().max(40).optional(), entityId: z.string().max(60).optional() }).safeParse(req.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const note = await prisma.note.create({ data: { farmId, ...parsed.data, authorId: verifyToken(tokenFromRequest(req))?.userId ?? null } });
    await audit(farmId, "Note", "create", note.id, null, note);
    return reply.code(201).send(note);
  });
  app.delete("/farms/:farmId/notes/:id", async (req, reply) => {
    const { farmId, id } = req.params as { farmId: string; id: string };
    const before = await prisma.note.findFirst({ where: { id, farmId } });
    if (!before) return reply.notFound();
    await prisma.note.delete({ where: { id } });
    await audit(farmId, "Note", "delete", id, before, null);
    return reply.code(204).send();
  });
}
