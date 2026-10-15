/**
 * Generic CSV import targets (Roadmap 2, Phase 17). Each table lists its fields and
 * the header names other systems use for them, so a column auto-maps when it can.
 */
export type FieldType = "string" | "date" | "money" | "number" | "bool";
export type ImportField = { key: string; label: string; type: FieldType; required?: boolean; aliases: string[] };
export type ImportTable = { key: string; label: string; idField?: string; fields: ImportField[] };

const f = (key: string, label: string, type: FieldType, aliases: string[], required = false): ImportField => ({ key, label, type, aliases, required });

export const IMPORT_TABLES: ImportTable[] = [
  { key: "customers", label: "Customers", idField: "id", fields: [f("id", "ID", "string", ["customer id", "id", "customer #"]), f("name", "Name", "string", ["name", "customer", "display name", "company"], true), f("email", "Email", "string", ["email", "e-mail"]), f("terms", "Terms (Days)", "number", ["terms", "payment terms"])] },
  { key: "vendors", label: "Vendors", idField: "id", fields: [f("id", "ID", "string", ["vendor id", "id"]), f("name", "Name", "string", ["name", "vendor", "supplier", "display name"], true), f("category", "Category", "string", ["category", "type"]), f("terms", "Terms (Days)", "number", ["terms", "payment terms"])] },
  { key: "invoices", label: "Invoices", idField: "number", fields: [f("number", "Invoice Number", "string", ["invoice", "invoice #", "invoice number", "num", "no."], true), f("customer", "Customer", "string", ["customer", "client", "bill to"], true), f("issued", "Invoice Date", "date", ["date", "invoice date", "issued"], true), f("due", "Due Date", "date", ["due", "due date"]), f("total", "Total", "money", ["total", "amount", "invoice total"], true), f("balance", "Balance Due", "money", ["balance", "open balance", "amount due", "outstanding"]), f("description", "Description", "string", ["description", "memo"])] },
  { key: "bills", label: "Bills", idField: "number", fields: [f("number", "Bill Number", "string", ["bill", "bill #", "ref no", "number", "num"], true), f("vendor", "Vendor", "string", ["vendor", "supplier", "payee"], true), f("billDate", "Bill Date", "date", ["date", "bill date"], true), f("due", "Due Date", "date", ["due", "due date"]), f("total", "Total", "money", ["total", "amount"], true), f("balance", "Balance Due", "money", ["balance", "open balance", "amount due"]), f("category", "Category", "string", ["category", "account"]), f("description", "Description", "string", ["description", "memo"])] },
  { key: "animals", label: "Animals (CattleMax)", idField: "tag", fields: [f("tag", "Tag / ID", "string", ["tag", "tag number", "visual id", "animal id", "eid"], true), f("name", "Name", "string", ["name", "registered name"]), f("species", "Species", "string", ["species", "animal type"]), f("sex", "Sex", "string", ["sex", "gender"]), f("breed", "Breed", "string", ["breed"]), f("birthDate", "Birth Date", "date", ["birth date", "birthdate", "dob", "born"]), f("dam", "Dam", "string", ["dam", "dam tag", "dam id"]), f("sire", "Sire", "string", ["sire", "sire tag", "sire id"]), f("status", "Status", "string", ["status", "active"]), f("class", "Class", "string", ["class", "category", "animal class", "type"]), f("weaningWeight", "Weaning Weight (lb)", "number", ["weaning weight", "205 day weight", "ww"]), f("saleWeight", "Sale Weight (lb)", "number", ["sale weight", "sold weight"]), f("salePrice", "Sale Price", "money", ["sale price", "sold price", "price"]), f("dispositionDate", "Sold / Died Date", "date", ["sale date", "sold date", "death date", "disposal date"])] },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9#]+/g, " ").trim();
/** Header -> field key, by exact alias then by containment. */
export function autoMap(table: ImportTable, headers: string[]): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  const used = new Set<string>();
  for (const field of table.fields) {
    const hit = headers.find((h) => !used.has(h) && field.aliases.includes(norm(h))) ?? headers.find((h) => !used.has(h) && field.aliases.some((a) => norm(h).includes(a)));
    out[field.key] = hit ?? null;
    if (hit) used.add(hit);
  }
  return out;
}

/** Parse "$1,234.50", "(12.00)", "1234" to cents; null when blank or unparseable. */
export function parseMoney(v: string | undefined): bigint | null {
  if (v == null || v.trim() === "") return null;
  const neg = /^\(.*\)$/.test(v.trim()) || v.trim().startsWith("-");
  const n = Number(v.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? BigInt(Math.round(n * 100)) * (neg ? -1n : 1n) : null;
}
