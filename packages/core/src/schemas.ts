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

export const importRowSchema = z.object({
  date: z.coerce.date(),
  description: z.string(),
  amount: z.string(),                 // raw; converted via toCents at ingest
  category: z.string().optional(),
});
