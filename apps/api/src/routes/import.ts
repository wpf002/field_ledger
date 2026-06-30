import type { FastifyInstance } from "fastify";
import { prisma } from "@fl/db";
import { z } from "zod";
import { buildPreview, dedupeHash, deserializeCents, normalizeDesc, type ParsedRow } from "@fl/core";

const isoOf = (d: Date) => d.toISOString().slice(0, 10);

/** Existing ledger dedupe keys for a farm (hashes computed live so rows created
 *  before dedupeHash existed are still caught). */
async function existingKeys(farmId: string) {
  const txns = await prisma.transaction.findMany({
    where: { farmId },
    select: { date: true, amountCents: true, description: true, externalId: true },
  });
  const hashes = new Set<string>();
  const externalIds = new Set<string>();
  for (const t of txns) {
    hashes.add(dedupeHash(isoOf(t.date), t.amountCents, t.description));
    if (t.externalId) externalIds.add(t.externalId);
  }
  return { hashes, externalIds };
}

const parsedRow = z.object({
  date: z.string(),
  description: z.string(),
  amount: z.string(),
  externalId: z.string().optional(),
});

const commitRow = z.object({
  date: z.string(),                 // ISO yyyy-mm-dd
  description: z.string().min(1),
  amountCents: z.string().regex(/^-?\d+$/),
  accountCode: z.string().min(1),
  externalId: z.string().optional(),
  dedupeHash: z.string().optional(),
});

export async function registerImport(app: FastifyInstance) {
  // Dedupe-aware preview: classify + map each row, flag duplicates.
  app.post("/farms/:farmId/import/preview", async (req, reply) => {
    const { farmId } = req.params as { farmId: string };
    const parsed = z.object({ rows: z.array(parsedRow) }).safeParse(req.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const keys = await existingKeys(farmId);
    const preview = buildPreview(parsed.data.rows as ParsedRow[], keys);
    // Replace inferred Schedule F labels with the farm's chart-of-accounts labels.
    const accounts = await prisma.account.findMany({ where: { farmId } });
    const labelByCode = new Map(accounts.map((a) => [a.code, a.label]));
    for (const r of preview) r.accountLabel = labelByCode.get(r.accountCode) ?? r.accountLabel;
    return { rows: preview };
  });

  // Commit: create an ImportBatch + transactions, skipping dupes and locked periods.
  app.post("/farms/:farmId/import/commit", async (req, reply) => {
    const { farmId } = req.params as { farmId: string };
    const parsed = z.object({
      source: z.enum(["csv", "ofx"]),
      filename: z.string().optional(),
      rows: z.array(commitRow),
    }).safeParse(req.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);

    const [accounts, lockedPeriods, inventory, keys] = await Promise.all([
      prisma.account.findMany({ where: { farmId } }),
      prisma.accountingPeriod.findMany({ where: { farmId, locked: true }, select: { year: true } }),
      prisma.inventoryItem.findMany({ where: { farmId }, select: { id: true, name: true } }),
      existingKeys(farmId),
    ]);
    const acctByCode = new Map(accounts.map((a) => [a.code, a]));
    const lockedYears = new Set(lockedPeriods.map((p) => p.year));

    const batch = await prisma.importBatch.create({
      data: { farmId, source: parsed.data.source, filename: parsed.data.filename, rowCount: parsed.data.rows.length },
    });

    let imported = 0, duplicates = 0;
    const skipped: { description: string; reason: string }[] = [];
    const committedHashes = new Set<string>();

    for (const row of parsed.data.rows) {
      const account = acctByCode.get(row.accountCode);
      if (!account) { skipped.push({ description: row.description, reason: `Unknown account ${row.accountCode}` }); continue; }

      const date = new Date(row.date);
      if (lockedYears.has(date.getUTCFullYear())) { skipped.push({ description: row.description, reason: `Period ${date.getUTCFullYear()} locked` }); continue; }

      const amountCents = deserializeCents(row.amountCents);
      const hash = row.dedupeHash || dedupeHash(row.date, amountCents, row.description);
      if (keys.hashes.has(hash) || committedHashes.has(hash) || (row.externalId && keys.externalIds.has(row.externalId))) {
        duplicates++; continue;
      }
      committedHashes.add(hash);

      // Best-effort FK related-item: match description against an inventory name.
      const nd = normalizeDesc(row.description);
      const relatedInventoryId = inventory.find((i) => nd.includes(normalizeDesc(i.name)))?.id ?? null;

      const tx = await prisma.transaction.create({
        data: {
          farmId, date, description: row.description, accountId: account.id,
          amountCents, source: "import", importBatchId: batch.id,
          externalId: row.externalId, dedupeHash: hash, relatedInventoryId,
        },
      });
      await prisma.auditLog.create({
        data: { farmId, action: "import", entity: "Transaction", entityId: tx.id, after: { batchId: batch.id, amountCents: amountCents.toString() } },
      });
      imported++;
    }

    await prisma.importBatch.update({ where: { id: batch.id }, data: { importedCount: imported, duplicateCount: duplicates } });
    return reply.code(201).send({ batchId: batch.id, imported, duplicates, skipped });
  });
}
