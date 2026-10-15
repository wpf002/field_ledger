import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { categoryToScheduleF, inferScheduleFCode, type ExternalBatch } from "@fl/core";

/**
 * Write a provider-neutral batch into the books. Idempotent on externalId: a record
 * already imported is updated (balances, paid status), never duplicated.
 */
export async function applyExternalBatch(prisma: PrismaClient, farmId: string, source: string, batch: ExternalBatch) {
  const counts = { parties: 0, invoices: 0, bills: 0, transactions: 0, skipped: 0, prices: 0, benchmarks: 0 };
  const accounts = await prisma.account.findMany({ where: { farmId } });
  const bySf = new Map<string, string>();
  for (const a of accounts) if (a.scheduleFCode && !bySf.has(a.scheduleFCode)) bySf.set(a.scheduleFCode, a.id);
  const accountFor = (hint: string | null | undefined, description: string, income: boolean) =>
    bySf.get(categoryToScheduleF(hint, income) ?? inferScheduleFCode(description, income)) ?? bySf.get(income ? "other_income" : "other_expense") ?? accounts[0]?.id;

  const partyIds = new Map<string, { id: string; kind: "customer" | "vendor" }>();
  for (const p of batch.parties) {
    if (p.kind === "customer") {
      const c = await prisma.customer.upsert({ where: { farmId_externalId: { farmId, externalId: p.externalId } }, create: { farmId, externalId: p.externalId, name: p.name, email: p.email ?? null }, update: { name: p.name, email: p.email ?? undefined } });
      partyIds.set(p.externalId, { id: c.id, kind: "customer" });
    } else {
      const v = await prisma.vendor.upsert({ where: { farmId_externalId: { farmId, externalId: p.externalId } }, create: { farmId, externalId: p.externalId, name: p.name }, update: { name: p.name } });
      partyIds.set(p.externalId, { id: v.id, kind: "vendor" });
    }
    counts.parties++;
  }
  const party = async (ext: string, name: string | null | undefined, kind: "customer" | "vendor") => {
    const hit = partyIds.get(ext); if (hit) return hit.id;
    const id = kind === "customer"
      ? (await prisma.customer.upsert({ where: { farmId_externalId: { farmId, externalId: ext } }, create: { farmId, externalId: ext, name: name ?? ext }, update: {} })).id
      : (await prisma.vendor.upsert({ where: { farmId_externalId: { farmId, externalId: ext } }, create: { farmId, externalId: ext, name: name ?? ext }, update: {} })).id;
    partyIds.set(ext, { id, kind }); return id;
  };

  for (const d of batch.docs) {
    const issued = new Date(`${d.issued}T00:00:00Z`), due = new Date(`${d.due}T00:00:00Z`);
    const paid = d.balanceCents === 0n;
    if (d.kind === "invoice") {
      const customerId = await party(d.partyExternalId, d.partyName, "customer");
      const existing = await prisma.invoice.findFirst({ where: { farmId, externalId: d.externalId } });
      const data = { totalCents: d.totalCents, amountPaidCents: d.totalCents - d.balanceCents, status: (paid ? "PAID" : "SENT") as "PAID" | "SENT", dueAt: due, description: d.description ?? null };
      if (existing) await prisma.invoice.update({ where: { id: existing.id }, data });
      else {
        // Keep the source's invoice number unless the farm already uses it.
        const taken = await prisma.invoice.findFirst({ where: { farmId, number: d.number } });
        await prisma.invoice.create({ data: { farmId, number: taken ? `${d.number}-${source}` : d.number, externalId: d.externalId, customerId, issuedAt: issued, ...data, lineItems: { create: [{ description: d.description ?? d.number, quantity: 1, unitCents: d.totalCents, amountCents: d.totalCents }] } } });
      }
      counts.invoices++;
    } else {
      const vendorId = await party(d.partyExternalId, d.partyName, "vendor");
      const number = d.externalId;
      await prisma.bill.upsert({
        where: { farmId_number: { farmId, number } },
        create: { farmId, number, vendorId, billDate: issued, dueDate: due, description: d.description ?? null, amountCents: d.totalCents, amountPaidCents: d.totalCents - d.balanceCents, status: paid ? "Paid" : "Open" },
        update: { amountCents: d.totalCents, amountPaidCents: d.totalCents - d.balanceCents, status: paid ? "Paid" : "Open", dueDate: due },
      });
      counts.bills++;
    }
  }

  const seen = new Set((await prisma.transaction.findMany({ where: { farmId, externalId: { in: batch.txns.map((t) => t.externalId) } }, select: { externalId: true } })).map((t) => t.externalId));
  for (const t of batch.txns) {
    if (t.pending || seen.has(t.externalId) || t.amountCents === 0n) { counts.skipped++; continue; }
    const income = t.amountCents > 0n;
    const accountId = accountFor(t.categoryHint, t.description, income);
    if (!accountId) { counts.skipped++; continue; }
    await prisma.transaction.create({
      data: {
        farmId, date: new Date(`${t.date}T00:00:00Z`), cashDate: t.cashDate ? new Date(`${t.cashDate}T00:00:00Z`) : null, amountCents: t.amountCents, cashEffectCents: t.cashDate ? t.amountCents : null,
        description: t.description, vendor: t.counterparty ?? null, accountId, source, externalId: t.externalId,
      },
    });
    counts.transactions++;
  }

  for (const p of batch.prices) {
    // One quote per symbol and day; a re-sync doesn't stack duplicates.
    const asOf = new Date(`${p.asOf}T00:00:00Z`);
    if (await prisma.commodityPrice.findFirst({ where: { symbol: p.symbol, asOf }, select: { id: true } })) continue;
    await prisma.commodityPrice.create({ data: { symbol: p.symbol, label: p.label, unit: p.unit, priceCents: p.priceCents, source: p.source, asOf } });
    counts.prices++;
  }
  for (const b of batch.benchmarks ?? []) {
    const key = { farmId, source, year: b.year, region: b.region, metric: b.metric };
    await prisma.benchmark.upsert({ where: { farmId_source_year_region_metric: key }, update: { label: b.label, value: b.value, median: b.median, farmType: b.farmType }, create: { ...key, label: b.label, value: b.value, median: b.median, farmType: b.farmType } });
    counts.benchmarks++;
  }
  if (counts.transactions || counts.invoices) {
    await prisma.auditLog.create({ data: { farmId, action: "import", entity: "Integration", entityId: source, after: counts } });
  }
  return counts;
}

// ---------- token encryption (AES-256-GCM) ----------
const key = () => createHash("sha256").update(process.env.INTEGRATIONS_KEY || process.env.AUTH_SECRET || "insecure-dev-secret").digest();
export function sealToken(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
}
export function openToken(sealed: string | null | undefined): string | null {
  if (!sealed) return null;
  const [iv, tag, body] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
  if (!iv || !tag || !body) return null;
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(body), d.final()]).toString("utf8");
}
