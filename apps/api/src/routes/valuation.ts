import type { FastifyInstance } from "fastify";
import { prisma } from "@fl/db";
import { z } from "zod";
import { valueInventoryItem, latestPriceCents, sumCents, deserializeCents } from "@fl/core";

export async function registerValuation(app: FastifyInstance) {
  // Live mark-to-market valuation of all inventory + asset totals.
  app.get("/farms/:farmId/valuation", async (req) => {
    const { farmId } = req.params as { farmId: string };
    const [items, prices] = await Promise.all([
      prisma.inventoryItem.findMany({ where: { farmId }, orderBy: { createdAt: "asc" } }),
      prisma.commodityPrice.findMany(),
    ]);
    const asOf = new Date();
    const valued = items.map((item) => ({ item, valuation: valueInventoryItem(item, latestPriceCents(prices, item.marketSymbol), asOf), marketPriceCents: latestPriceCents(prices, item.marketSymbol) }));
    return {
      items: valued,
      totals: {
        assetsCents: sumCents(valued.map((v) => v.valuation.valueCents)),
        marketableCents: sumCents(valued.filter((v) => v.valuation.marketable).map((v) => v.valuation.valueCents)),
      },
    };
  });

  // Manual override of an item's per-unit value (Invariant 2: audited).
  app.patch("/farms/:farmId/inventory/:id", async (req, reply) => {
    const { farmId, id } = req.params as { farmId: string; id: string };
    const parsed = z.object({ unitValueCents: z.string().regex(/^\d+$/).nullable() }).safeParse(req.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);

    const before = await prisma.inventoryItem.findFirst({ where: { id, farmId } });
    if (!before) return reply.notFound("Inventory item not found");
    const next = parsed.data.unitValueCents == null ? null : deserializeCents(parsed.data.unitValueCents);

    const after = await prisma.inventoryItem.update({ where: { id }, data: { unitValueCents: next } });
    await prisma.auditLog.create({
      data: {
        farmId, action: "update", entity: "InventoryItem", entityId: id,
        before: { unitValueCents: before.unitValueCents?.toString() ?? null },
        after: { unitValueCents: next?.toString() ?? null },
      },
    });
    return after;
  });

  // Latest quote per symbol.
  app.get("/commodity-prices", async () => {
    const prices = await prisma.commodityPrice.findMany({ orderBy: { asOf: "desc" } });
    const seen = new Set<string>();
    return prices.filter((p) => (seen.has(p.symbol) ? false : (seen.add(p.symbol), true)));
  });

  // Upsert a quote (a live USDA/CME provider would post here; manual for now).
  app.post("/commodity-prices", async (req, reply) => {
    const parsed = z.object({
      symbol: z.string().min(1), label: z.string().optional(), unit: z.string().min(1),
      priceCents: z.string().regex(/^\d+$/), source: z.enum(["usda", "cme", "manual"]).default("manual"),
    }).safeParse(req.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const created = await prisma.commodityPrice.create({
      data: { symbol: parsed.data.symbol, label: parsed.data.label, unit: parsed.data.unit, priceCents: deserializeCents(parsed.data.priceCents), source: parsed.data.source },
    });
    return reply.code(201).send(created);
  });
}
