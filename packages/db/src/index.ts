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
export { loadEnterpriseInputs } from "./enterprise-inputs.js";
export { evaluateLever, leverContext, LEVER_TEMPLATES, type LeverTemplate, type LeverParams } from "./levers.js";
export { generateInsights, type Insight, type Severity } from "./insights.js";
export { forecastContext, SCENARIO_KEYS, type ForecastContext } from "./forecast-context.js";
export { runWhatIf, type WhatIf, type Outcome } from "./whatif.js";
export { generateBrief, type Brief, type BriefLine } from "./brief.js";
export { applyExternalBatch, sealToken, openToken } from "./ingest.js";
export { createApiToken, verifyApiToken } from "./api-tokens.js";
export { registerClient, findClient, createCode, exchangeCode, refreshGrant, parseScope, validRedirect, OAuthError, ACCESS_TTL_S, type OAuthScope } from "./oauth.js";
export * from "./marketing.js";
