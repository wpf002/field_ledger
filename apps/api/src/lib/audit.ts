import { prisma } from "@fl/db";

/** Invariant 2: record every financial mutation (who/what/when/before/after).
 *  Generic over entity type; BigInt fields are stringified for the JSON trail. */
export function audit(farmId: string, entity: string, action: string, entityId: string, before: unknown, after: unknown) {
  return prisma.auditLog.create({
    data: { farmId, action, entity, entityId, before: snapshot(before), after: snapshot(after) },
  });
}

/** JSON-safe deep snapshot (BigInt → string) for the audit trail. */
export function snapshot(value: unknown): object | undefined {
  if (value == null) return undefined;
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
}
