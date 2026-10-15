import type { FastifyInstance } from "fastify";
import { prisma } from "@fl/db";
import { z } from "zod";
import { buildPreview, dedupeHash, deserializeCents, normalizeDesc, IMPORT_TABLES, parseMoney, normalizeDate, type ParsedRow } from "@fl/core";

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
          amountCents, cashDate: date, cashEffectCents: amountCents, source: "import", importBatchId: batch.id,
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

// ---------- Generic table import (Roadmap 2, Phase 17) ----------

const tableBody = z.object({ table: z.string(), rows: z.array(z.record(z.string(), z.string())).max(20_000), filename: z.string().optional() });

export async function registerTableImport(app: FastifyInstance) {
  app.get("/import/tables", async () => IMPORT_TABLES);

  /** Rows arrive already mapped to field keys. Upserts on the table's ID field. */
  app.post("/farms/:farmId/import/table", async (req, reply) => {
    const { farmId } = req.params as { farmId: string };
    const parsed = tableBody.safeParse(req.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const table = IMPORT_TABLES.find((t) => t.key === parsed.data.table);
    if (!table) return reply.badRequest("Unknown table");
    const errors: string[] = [];
    let created = 0, updated = 0;
    const date = (v?: string) => (v ? new Date(`${normalizeDate(v)}T00:00:00Z`) : null);
    const ext = (v: string) => `csv:${table.key}:${v.trim().toLowerCase()}`;
    const customerFor = async (name: string) => (await prisma.customer.upsert({ where: { farmId_externalId: { farmId, externalId: `csv:customers:${name.trim().toLowerCase()}` } }, create: { farmId, externalId: `csv:customers:${name.trim().toLowerCase()}`, name: name.trim() }, update: {} })).id;
    const vendorFor = async (name: string) => (await prisma.vendor.upsert({ where: { farmId_externalId: { farmId, externalId: `csv:vendors:${name.trim().toLowerCase()}` } }, create: { farmId, externalId: `csv:vendors:${name.trim().toLowerCase()}`, name: name.trim() }, update: {} })).id;

    for (const [i, r] of parsed.data.rows.entries()) {
      try {
        for (const fld of table.fields) if (fld.required && !r[fld.key]?.trim()) throw new Error(`${fld.label} is required`);
        if (table.key === "customers" || table.key === "vendors") {
          const key = ext(r.id || r.name!);
          const data = { name: r.name!.trim(), paymentTermsDays: r.terms ? Number(r.terms) || null : null };
          const model = table.key === "customers" ? prisma.customer : prisma.vendor;
          const found = await (model as typeof prisma.customer).findUnique({ where: { farmId_externalId: { farmId, externalId: key } } });
          if (table.key === "customers") await prisma.customer.upsert({ where: { farmId_externalId: { farmId, externalId: key } }, create: { farmId, externalId: key, email: r.email || null, ...data }, update: { email: r.email || undefined, ...data } });
          else await prisma.vendor.upsert({ where: { farmId_externalId: { farmId, externalId: key } }, create: { farmId, externalId: key, category: r.category || null, ...data }, update: { category: r.category || undefined, ...data } });
          found ? updated++ : created++;
        } else if (table.key === "invoices") {
          const total = parseMoney(r.total)!, balance = parseMoney(r.balance) ?? total;
          const issued = date(r.issued)!, due = date(r.due) ?? issued;
          const existing = await prisma.invoice.findUnique({ where: { farmId_number: { farmId, number: r.number!.trim() } } });
          const data = { totalCents: total, amountPaidCents: total - balance, status: (balance === 0n ? "PAID" : "SENT") as "PAID" | "SENT", dueAt: due, description: r.description || null };
          if (existing) { await prisma.invoice.update({ where: { id: existing.id }, data }); updated++; }
          else { await prisma.invoice.create({ data: { farmId, number: r.number!.trim(), externalId: ext(r.number!), customerId: await customerFor(r.customer!), issuedAt: issued, ...data, lineItems: { create: [{ description: r.description || r.number!, quantity: 1, unitCents: total, amountCents: total }] } } }); created++; }
        } else if (table.key === "bills") {
          const total = parseMoney(r.total)!, balance = parseMoney(r.balance) ?? total;
          const billDate = date(r.billDate)!, due = date(r.due) ?? billDate;
          const existing = await prisma.bill.findUnique({ where: { farmId_number: { farmId, number: r.number!.trim() } } });
          const data = { amountCents: total, amountPaidCents: total - balance, status: balance === 0n ? "Paid" : "Open", dueDate: due, category: r.category || null, description: r.description || null };
          if (existing) { await prisma.bill.update({ where: { id: existing.id }, data }); updated++; }
          else { await prisma.bill.create({ data: { farmId, number: r.number!.trim(), vendorId: await vendorFor(r.vendor!), billDate, ...data } }); created++; }
        } else if (table.key === "animals") {
          const tag = r.tag!.trim();
          const data = {
            species: r.species?.trim() || "Cattle", sex: r.sex || null, breed: r.breed || null, nameOrTag: r.name || tag, birthDate: date(r.birthDate), damId: r.dam || null, sireId: r.sire || null,
            status: r.status || null, currentClass: r.class || null, weaningWeightLb: r.weaningWeight ? Number(r.weaningWeight) : null, saleWeightLb: r.saleWeight ? Number(r.saleWeight) : null,
            salePriceCents: parseMoney(r.salePrice), dispositionDate: date(r.dispositionDate), origin: "import",
          };
          const existing = await prisma.animal.findUnique({ where: { farmId_externalId: { farmId, externalId: tag } } });
          await prisma.animal.upsert({ where: { farmId_externalId: { farmId, externalId: tag } }, create: { farmId, externalId: tag, ...data }, update: data });
          existing ? updated++ : created++;
        }
      } catch (e) {
        if (errors.length < 50) errors.push(`Row ${i + 2}: ${e instanceof Error ? e.message : "invalid"}`);
      }
    }
    await prisma.auditLog.create({ data: { farmId, action: "import", entity: table.label, entityId: parsed.data.filename ?? "csv", after: { created, updated, errors: errors.length } } });
    return { created, updated, errors };
  });
}
