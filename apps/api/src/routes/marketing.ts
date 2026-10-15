import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma, loadCommodityExposure } from "@fl/db";
import { audit } from "../lib/audit.js";

/** Marketing contracts (spec §23) and the commodity exposure they feed. */
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform((s) => new Date(`${s}T00:00:00Z`));
const contractInput = z.object({
  number: z.string().max(60).optional(),
  commodity: z.string().min(1).max(40),
  cropYear: z.number().int().min(2000).max(2100),
  type: z.enum(["forward", "hta", "basis", "min_price", "delayed_price"]),
  quantity: z.number().positive(),
  unit: z.string().min(1).max(20),
  price: z.number().nonnegative().nullable().optional(),
  basis: z.number().nullable().optional(),
  buyer: z.string().max(120).optional(),
  deliveryStart: day.nullable().optional(),
  deliveryEnd: day.nullable().optional(),
  delivered: z.number().nonnegative().optional(),
  status: z.enum(["open", "delivered", "cancelled"]).optional(),
  notes: z.string().max(500).optional(),
});

export async function registerMarketing(app: FastifyInstance) {
  app.get("/farms/:farmId/contracts", async (req) => {
    const { farmId } = req.params as { farmId: string };
    return prisma.marketingContract.findMany({ where: { farmId }, orderBy: [{ cropYear: "desc" }, { deliveryStart: "asc" }] });
  });

  app.get("/farms/:farmId/commodity-exposure", async (req) => {
    const { farmId } = req.params as { farmId: string };
    return loadCommodityExposure(prisma, farmId);
  });

  app.post("/farms/:farmId/contracts", async (req, reply) => {
    const { farmId } = req.params as { farmId: string };
    const parsed = contractInput.safeParse(req.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const created = await prisma.marketingContract.create({ data: { farmId, ...parsed.data } });
    await audit(farmId, "MarketingContract", "create", created.id, null, created);
    return reply.code(201).send(created);
  });

  app.put("/farms/:farmId/contracts/:id", async (req, reply) => {
    const { farmId, id } = req.params as { farmId: string; id: string };
    const before = await prisma.marketingContract.findFirst({ where: { id, farmId } });
    if (!before) return reply.notFound();
    const parsed = contractInput.partial().safeParse(req.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const updated = await prisma.marketingContract.update({ where: { id }, data: parsed.data });
    await audit(farmId, "MarketingContract", "update", id, before, updated);
    return updated;
  });

  app.delete("/farms/:farmId/contracts/:id", async (req, reply) => {
    const { farmId, id } = req.params as { farmId: string; id: string };
    const before = await prisma.marketingContract.findFirst({ where: { id, farmId } });
    if (!before) return reply.notFound();
    await prisma.marketingContract.delete({ where: { id } });
    await audit(farmId, "MarketingContract", "delete", id, before, null);
    return reply.code(204).send();
  });
}
