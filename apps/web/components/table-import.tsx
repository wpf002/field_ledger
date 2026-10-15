"use client";
import { useMemo, useState } from "react";
import { csvToTable, autoMap, IMPORT_TABLES } from "@fl/core";

const API = process.env.NEXT_PUBLIC_API_URL ?? "/api";

/** Upload a CSV, map its columns to a table's fields, preview, and import. */
export function TableImport({ farmId, initialTable, canWrite }: { farmId: string; initialTable: string; canWrite: boolean }) {
  const [tableKey, setTableKey] = useState(IMPORT_TABLES.some((t) => t.key === initialTable) ? initialTable : "customers");
  const table = IMPORT_TABLES.find((t) => t.key === tableKey)!;
  const [file, setFile] = useState<{ name: string; headers: string[]; rows: string[][] } | null>(null);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [result, setResult] = useState<{ created: number; updated: number; errors: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async (f: File) => {
    const t = csvToTable(await f.text());
    setFile({ name: f.name, headers: t.headers, rows: t.rows });
    setMapping(autoMap(table, t.headers));
    setResult(null);
  };
  const mapped = useMemo(() => (file ? file.rows.map((r) => Object.fromEntries(table.fields.map((fl) => [fl.key, mapping[fl.key] ? r[file.headers.indexOf(mapping[fl.key]!)] ?? "" : ""]))) : []), [file, mapping, table]);
  const missing = table.fields.filter((fl) => fl.required && !mapping[fl.key]);

  const commit = async () => {
    setBusy(true);
    try {
      const r = await fetch(`${API}/farms/${farmId}/import/table`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ table: table.key, rows: mapped, filename: file?.name }) });
      setResult(await r.json());
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <select value={tableKey} onChange={(e) => { setTableKey(e.target.value); setFile(null); setResult(null); }} className="input">
          {IMPORT_TABLES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} className="text-sm" />
      </div>
      {file && (
        <div className="rounded-card bg-surface p-5 shadow-card">
          <h3 className="font-serif text-lg font-semibold text-ink">Columns</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {table.fields.map((fl) => (
              <label key={fl.key} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted">{fl.label}{fl.required && " *"}</span>
                <select value={mapping[fl.key] ?? ""} onChange={(e) => setMapping({ ...mapping, [fl.key]: e.target.value || null })} className="input w-44">
                  <option value="">Not mapped</option>
                  {file.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
            ))}
          </div>
          <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
            <thead><tr>{table.fields.filter((fl) => mapping[fl.key]).map((fl) => <th key={fl.key} className="px-2 py-1 text-left text-xs uppercase tracking-wider text-muted">{fl.label}</th>)}</tr></thead>
            <tbody>{mapped.slice(0, 8).map((r, i) => <tr key={i} className="border-t border-border">{table.fields.filter((fl) => mapping[fl.key]).map((fl) => <td key={fl.key} className="px-2 py-1.5 text-ink">{r[fl.key]}</td>)}</tr>)}</tbody>
          </table></div>
          <div className="mt-4 flex items-center gap-3">
            <button disabled={!canWrite || busy || missing.length > 0} onClick={commit} className="rounded-btn bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-deep disabled:opacity-50">Import {file.rows.length.toLocaleString()} Rows</button>
            {missing.length > 0 && <span className="text-xs text-negative">Map {missing.map((m) => m.label).join(", ")}</span>}
          </div>
          {result && (
            <div className="mt-4 text-sm">
              <p className="text-ink">{result.created} created · {result.updated} updated · {result.errors.length} skipped</p>
              {result.errors.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-negative">{result.errors.slice(0, 10).map((e) => <li key={e}>{e}</li>)}</ul>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
