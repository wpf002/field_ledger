/**
 * Phase 1 import pipeline (pure, dependency-free so it runs on both sides):
 *  - CSV + OFX/QFX parsing
 *  - description normalization + stable dedupe hashing
 *  - Schedule F category inference (every row gets a tax mapping — Invariant 6)
 */
import { z } from "zod";
import { toCents } from "./money.js";
import { SCHEDULE_F } from "./schedule-f.js";

// ---------- CSV ----------
/** Minimal RFC-4180-ish CSV parser: handles quoted fields, escaped quotes,
 *  embedded commas/newlines, and CRLF. Returns rows of string cells. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const s = text.replace(/^﻿/, ""); // strip BOM
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; } else inQuotes = false;
      } else cell += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(cell); cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); if (row.length > 1 || row[0] !== "") rows.push(row); }
  return rows;
}

export type CsvTable = { headers: string[]; rows: string[][] };
export function csvToTable(text: string): CsvTable {
  const all = parseCsv(text);
  if (all.length === 0) return { headers: [], rows: [] };
  return { headers: all[0]!.map((h) => h.trim()), rows: all.slice(1) };
}

// ---------- OFX / QFX ----------
export type ParsedRow = { date: string; description: string; amount: string; externalId?: string };

const ofxTag = (block: string, tag: string) => {
  const m = block.match(new RegExp(`<${tag}>([^<\r\n]*)`, "i"));
  return m ? m[1]!.trim() : undefined;
};
const ofxDate = (raw?: string) => {
  if (!raw) return "";
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : raw;
};

/** Extract transactions from an OFX/QFX document (STMTTRN blocks). */
export function parseOfx(text: string): ParsedRow[] {
  const out: ParsedRow[] = [];
  const blocks = text.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];
  for (const b of blocks) {
    const amount = ofxTag(b, "TRNAMT") ?? "";
    const name = ofxTag(b, "NAME") ?? ofxTag(b, "MEMO") ?? "";
    const memo = ofxTag(b, "MEMO");
    out.push({
      date: ofxDate(ofxTag(b, "DTPOSTED")),
      description: memo && memo !== name ? `${name} ${memo}`.trim() : name,
      amount,
      externalId: ofxTag(b, "FITID"),
    });
  }
  return out;
}

// ---------- normalization + dedupe ----------
export function normalizeDesc(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Stable non-crypto hash (FNV-1a) of the dedupe key. */
export function dedupeHash(isoDate: string, amountCents: bigint, description: string): string {
  const key = `${isoDate.slice(0, 10)}|${amountCents.toString()}|${normalizeDesc(description)}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

// ---------- Schedule F inference ----------
const EXPENSE_KEYWORDS: Record<string, string[]> = {
  fuel: ["diesel", "fuel", "gasoline", "gas ", "propane", "petroleum", " oil"],
  feed: ["feed", "hay", "cube", "supplement", "mineral", "forage", "silage"],
  veterinary: ["vet", "vaccin", "medicine", "breeding", "semen", "veterinary"],
  fertilizer: ["fertilizer", "lime", "nitrogen", "urea", "potash", "phosphate"],
  seeds_plants: ["seed", "seedling", "transplant"],
  repairs_maintenance: ["repair", "maintenance", "parts", "service"],
  rent_lease_equipment: ["equipment rent", "machinery lease", "implement rent"],
  rent_lease_land: ["land rent", "pasture lease", "ground rent", "cash rent"],
  interest_mortgage: ["mortgage interest"],
  interest_other: ["interest", "finance charge"],
  labor_hired: ["payroll", "wages", "labor", "farmhand"],
  insurance: ["insurance", "premium"],
  supplies: ["supply", "supplies", "tractor supply", "hardware"],
};
const INCOME_KEYWORDS: Record<string, string[]> = {
  livestock_sales_raised: ["cattle", "calf", "calves", "steer", "heifer", "livestock", "auction", "sale barn", "hogs", "lambs"],
  crop_sales: ["corn", "soybean", "wheat", "grain", "harvest", "crop", "hay sale", "elevator"],
  coop_distributions: ["coop", "co-op", "cooperative", "patronage"],
  ag_program_payments: ["fsa", "arc", "plc", "program payment", "subsidy", "usda", "conservation"],
  custom_hire_income: ["custom hire", "custom work", "machine work", "baling"],
};

/** Best-effort Schedule F account code for an imported line. Falls back to the
 *  catch-all income/expense line so every row carries a mapping. */
export function inferScheduleFCode(description: string, isIncome: boolean): string {
  const d = normalizeDesc(description);
  const table = isIncome ? INCOME_KEYWORDS : EXPENSE_KEYWORDS;
  for (const [code, words] of Object.entries(table)) {
    if (words.some((w) => d.includes(normalizeDesc(w)))) return code;
  }
  return isIncome ? "other_income" : "other_expense";
}

export const scheduleFLabel = (code: string) => SCHEDULE_F[code]?.label ?? code;

// ---------- mapping + preview types ----------
export const importMappingSchema = z.object({
  date: z.string(),        // header name (CSV) — ignored for OFX
  description: z.string(),
  amount: z.string(),
});
export type ImportMapping = z.infer<typeof importMappingSchema>;

export type PreviewRow = {
  date: string;            // ISO yyyy-mm-dd
  description: string;
  amountCents: string;     // signed integer cents
  kind: "INCOME" | "EXPENSE";
  accountCode: string;     // inferred Schedule F code
  accountLabel: string;
  externalId?: string;
  dedupeHash: string;
  duplicate: boolean;      // matches existing ledger or an earlier row in this file
  error?: string;
};

/** Build preview rows from raw parsed rows. `existing` is the set of dedupe keys
 *  (hash + externalId) already in the ledger. Pure — caller supplies that set. */
export function buildPreview(
  rows: ParsedRow[],
  existing: { hashes: Set<string>; externalIds: Set<string> },
): PreviewRow[] {
  const seen = new Set<string>();
  return rows.map((r) => {
    try {
      const iso = normalizeDate(r.date);
      const amountCents = toCents(r.amount);
      const isIncome = amountCents >= 0n;
      const code = inferScheduleFCode(r.description, isIncome);
      const hash = dedupeHash(iso, amountCents, r.description);
      const dupExisting =
        existing.hashes.has(hash) || (!!r.externalId && existing.externalIds.has(r.externalId));
      const dupInFile = seen.has(hash);
      seen.add(hash);
      return {
        date: iso,
        description: r.description.trim(),
        amountCents: amountCents.toString(),
        kind: isIncome ? "INCOME" : "EXPENSE",
        accountCode: code,
        accountLabel: scheduleFLabel(code),
        externalId: r.externalId,
        dedupeHash: hash,
        duplicate: dupExisting || dupInFile,
      } satisfies PreviewRow;
    } catch (e) {
      return {
        date: r.date, description: r.description, amountCents: "0", kind: "EXPENSE",
        accountCode: "other_expense", accountLabel: scheduleFLabel("other_expense"),
        dedupeHash: "", duplicate: false,
        error: e instanceof Error ? e.message : "Invalid row",
      } satisfies PreviewRow;
    }
  });
}

/** Coerce common bank date formats to ISO yyyy-mm-dd. */
export function normalizeDate(raw: string): string {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const mdy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (mdy) {
    let [, mm, dd, yy] = mdy;
    if (yy!.length === 2) yy = (Number(yy) > 50 ? "19" : "20") + yy;
    return `${yy}-${mm!.padStart(2, "0")}-${dd!.padStart(2, "0")}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  throw new Error(`Unrecognized date: ${raw}`);
}
