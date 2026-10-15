import ExcelJS from "exceljs";

/**
 * Reader for the Acreflow test-farm workbooks (data/testfarms/*.xlsx).
 * Every data tab is a header row followed by records; a few tabs carry a
 * one-cell title row above the header. Formula cells resolve to their cached
 * result, so statement tabs read as values.
 */
export type Cell = string | number | boolean | Date | null;
export type Row = Record<string, Cell>;
export type Workbook = { readme: string[]; tables: Record<string, Row[]>; headers: Record<string, string[]> };

function cellValue(v: ExcelJS.CellValue): Cell {
  if (v == null) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v instanceof Date) return v;
  if (typeof v === "object") {
    if ("result" in v) return cellValue((v as { result: ExcelJS.CellValue }).result);
    if ("richText" in v) return (v as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join("");
    if ("text" in v) return String((v as { text: unknown }).text);
    if ("error" in v) return null;
  }
  return null;
}

export async function readWorkbook(path: string): Promise<Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const tables: Record<string, Row[]> = {};
  const headers: Record<string, string[]> = {};
  let readme: string[] = [];
  wb.eachSheet((ws) => {
    const rows: Cell[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals: Cell[] = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => { vals[col - 1] = cellValue(cell.value); });
      rows.push(Array.from(vals, (x) => (x === undefined ? null : x)));
    });
    if (ws.name === "README") { readme = rows.map((r) => String(r[0] ?? "")); return; }
    // A title row has exactly one populated cell; the header follows it.
    const first = rows[0] ?? [];
    const start = first.filter((c) => c != null && c !== "").length === 1 && (rows[1]?.length ?? 0) > 1 ? 1 : 0;
    const head = (rows[start] ?? []).map((h) => (h instanceof Date ? h.toISOString().slice(0, 10) : h == null ? "" : String(h)));
    headers[ws.name] = head;
    tables[ws.name] = rows.slice(start + 1).map((r) => {
      const o: Row = {};
      head.forEach((h, i) => { if (h) o[h] = r[i] ?? null; });
      return o;
    });
  });
  return { readme, tables, headers };
}

// ---------- value coercion ----------
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/** Excel serial or Date -> UTC midnight Date. */
export function toDate(v: Cell | undefined): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
  if (typeof v === "number") return new Date(EXCEL_EPOCH + Math.round(v) * 86_400_000);
  if (/^\d{5}$/.test(String(v))) return new Date(EXCEL_EPOCH + Number(v) * 86_400_000);
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Decimal dollars -> integer cents. Rounds half away from zero on the exact cent. */
export function toCents(v: Cell | undefined): bigint {
  if (v == null || v === "") return 0n;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0n;
  return BigInt(Math.round(n * 100));
}
export const centsOrNull = (v: Cell | undefined) => (v == null || v === "" ? null : toCents(v));

export const str = (v: Cell | undefined): string | null => (v == null || v === "" ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v));
export const num = (v: Cell | undefined): number | null => (v == null || v === "" ? null : typeof v === "number" ? v : Number.isFinite(Number(v)) ? Number(v) : null);
export const int = (v: Cell | undefined): number | null => { const n = num(v); return n == null ? null : Math.round(n); };
export const bool = (v: Cell | undefined): boolean | null => (v == null || v === "" ? null : typeof v === "boolean" ? v : /^(true|yes|1)$/i.test(String(v)));
