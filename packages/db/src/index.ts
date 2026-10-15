import { PrismaClient } from "@prisma/client";
export * from "@prisma/client";
export { hashPassword, verifyPassword } from "./password.js";
const g = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = prisma;

/**
 * Prisma filter for income-statement rows. Excludes balance-sheet cash flows
 * (loan proceeds and principal, capex, owner draws) so sign-based income and
 * expense totals stay correct.
 */
export const pnlWhere = { account: { kind: { not: "BALANCE" as const } } };
export { wipeFarm } from "./wipe.js";
export { loadStatementInputs } from "./statement-inputs.js";
