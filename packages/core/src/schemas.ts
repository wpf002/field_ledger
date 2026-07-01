import { z } from "zod";

/** Money fields validate as integer-cent strings on the wire (Invariant 1). */
export const centsString = z.string().regex(/^-?\d+$/, "cents must be an integer string");

export const transactionInput = z.object({
  farmId: z.string().uuid(),
  date: z.coerce.date(),
  description: z.string().min(1),
  accountCode: z.string().min(1),     // maps to SCHEDULE_F
  amountCents: centsString,           // signed; income +, expense -
  vendor: z.string().optional(),
  relatedInventoryId: z.string().uuid().optional(),
});
export type TransactionInput = z.infer<typeof transactionInput>;

/** Partial update — only the fields the edit form sends. */
export const transactionUpdateInput = z.object({
  date: z.coerce.date().optional(),
  description: z.string().min(1).optional(),
  accountCode: z.string().min(1).optional(),
  amountCents: centsString.optional(),
  relatedLabel: z.string().optional(),
});
export type TransactionUpdateInput = z.infer<typeof transactionUpdateInput>;

export const liabilityInput = z.object({
  type: z.enum(["EQUIPMENT_LOAN", "OPERATING_LINE", "MORTGAGE", "OTHER"]),
  name: z.string().min(1),
  lender: z.string().optional(),
  originalCents: centsString,
  balanceCents: centsString,
  ratePct: z.coerce.number().min(0).max(100),
  paymentCents: centsString.optional(),
  paymentFreq: z.enum(["monthly", "quarterly", "semiannual", "annual"]).default("monthly"),
  nextPaymentAt: z.coerce.date().optional(),
});
export type LiabilityInput = z.infer<typeof liabilityInput>;

export const leaseInput = z.object({
  type: z.enum(["CASH_RENT", "CROP_SHARE"]),
  name: z.string().min(1),
  lessor: z.string().optional(),
  acres: z.coerce.number().min(0),
  termStart: z.coerce.date(),
  termEnd: z.coerce.date(),
  annualRentCents: centsString.optional(),   // null/absent for crop share
  paymentFreq: z.enum(["annual", "semiannual", "quarterly", "monthly"]).default("annual"),
  nextPaymentAt: z.coerce.date().optional(),
}).refine((l) => l.termEnd >= l.termStart, { message: "termEnd must be on or after termStart", path: ["termEnd"] });
export type LeaseInput = z.infer<typeof leaseInput>;

export const inventoryItemInput = z.object({
  category: z.enum(["LIVESTOCK", "FEED", "CROPS", "EQUIPMENT", "SUPPLIES"]),
  name: z.string().min(1),
  quantity: z.coerce.number().min(0),
  unit: z.string().min(1),
  location: z.string().optional(),
  unitValueCents: centsString.optional(),   // manual per-unit value
  costBasisCents: centsString.optional(),   // equipment cost basis
  usefulLifeYears: z.coerce.number().int().positive().optional(),
  salvageCents: centsString.optional(),
  acquiredAt: z.coerce.date().optional(),
});
export type InventoryItemInput = z.infer<typeof inventoryItemInput>;

export const financialGoalInput = z.object({
  name: z.string().min(1),
  kind: z.enum(["savings", "income_target"]),
  targetCents: centsString,
  currentCents: centsString.optional(),
  dueAt: z.coerce.date().optional(),
  note: z.string().optional(),
});
export type FinancialGoalInput = z.infer<typeof financialGoalInput>;

export const importRowSchema = z.object({
  date: z.coerce.date(),
  description: z.string(),
  amount: z.string(),                 // raw; converted via toCents at ingest
  category: z.string().optional(),
});
