"use client";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { PrimaryButton } from "@/components/ui/button";
import { csvToTable, parseOfx, type ParsedRow, type PreviewRow } from "@fl/core";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, ArrowLeft } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
type Account = { code: string; label: string; kind: "INCOME" | "EXPENSE" };
type Row = PreviewRow & { selected: boolean };
type Step = "upload" | "map" | "preview" | "done";

const guess = (headers: string[], re: RegExp) => headers.find((h) => re.test(h)) ?? "";

export function ImportFlow({ farmId }: { farmId: string }) {
  const [step, setStep] = useState<Step>("upload");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [source, setSource] = useState<"csv" | "ofx">("csv");
  const [filename, setFilename] = useState<string>();
  const [table, setTable] = useState<{ headers: string[]; rows: string[][] }>({ headers: [], rows: [] });
  const [ofxRows, setOfxRows] = useState<ParsedRow[]>([]);
  const [map, setMap] = useState({ date: "", description: "", amount: "" });
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ imported: number; duplicates: number; skipped: { description: string; reason: string }[] } | null>(null);

  useEffect(() => {
    fetch(`${API}/farms/${farmId}/accounts`).then((r) => r.json()).then(setAccounts).catch(() => {});
  }, [farmId]);

  async function onFile(file: File) {
    const text = await file.text();
    setFilename(file.name);
    const isOfx = /\.(ofx|qfx)$/i.test(file.name) || /<OFX>|<STMTTRN/i.test(text);
    if (isOfx) {
      setSource("ofx");
      setOfxRows(parseOfx(text));
      await runPreview(parseOfx(text));
    } else {
      setSource("csv");
      const t = csvToTable(text);
      setTable(t);
      setMap({
        date: guess(t.headers, /date|posted/i),
        description: guess(t.headers, /desc|name|memo|payee/i),
        amount: guess(t.headers, /amount|amt/i),
      });
      setStep("map");
    }
  }

  function buildRowsFromCsv(): ParsedRow[] {
    const di = table.headers.indexOf(map.date);
    const ni = table.headers.indexOf(map.description);
    const ai = table.headers.indexOf(map.amount);
    return table.rows
      .filter((r) => r[di] || r[ai])
      .map((r) => ({ date: r[di] ?? "", description: r[ni] ?? "", amount: r[ai] ?? "" }));
  }

  async function runPreview(parsedRows: ParsedRow[]) {
    setBusy(true);
    try {
      const res = await fetch(`${API}/farms/${farmId}/import/preview`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rows: parsedRows }),
      });
      const data = await res.json();
      setRows((data.rows as PreviewRow[]).map((r) => ({ ...r, selected: !r.duplicate && !r.error })));
      setStep("preview");
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    setBusy(true);
    try {
      const payload = {
        source, filename,
        rows: rows.filter((r) => r.selected && !r.error).map((r) => ({
          date: r.date, description: r.description, amountCents: r.amountCents,
          accountCode: r.accountCode, externalId: r.externalId, dedupeHash: r.dedupeHash,
        })),
      };
      const res = await fetch(`${API}/farms/${farmId}/import/commit`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
      });
      setResult(await res.json());
      setStep("done");
    } finally {
      setBusy(false);
    }
  }

  const selectedCount = rows.filter((r) => r.selected && !r.error).length;
  const dupCount = rows.filter((r) => r.duplicate).length;
  const errCount = rows.filter((r) => r.error).length;

  return (
    <>
      <a href="/transactions" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft size={15} /> Back to Transactions</a>

      {step === "upload" && (
        <Card className="p-6">
          <h3 className="font-serif text-xl font-semibold text-ink">Import transactions</h3>
          <p className="mt-1 text-sm text-muted">Upload a bank or accounting export (CSV, OFX, or QFX). We&rsquo;ll map columns, suggest a Schedule&nbsp;F category for each row, and flag duplicates before anything is written.</p>
          <label className="mt-5 flex cursor-pointer flex-col items-center gap-2 rounded-card border-2 border-dashed border-border py-14 text-center hover:bg-tag/20">
            <Upload size={26} className="text-muted" />
            <span className="text-sm text-muted">Click to choose a .csv, .ofx, or .qfx file</span>
            <input type="file" accept=".csv,.ofx,.qfx,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
        </Card>
      )}

      {step === "map" && (
        <Card className="p-6">
          <h3 className="flex items-center gap-2 font-serif text-xl font-semibold text-ink"><FileSpreadsheet size={18} /> Map columns</h3>
          <p className="mt-1 text-sm text-muted">{filename} · {table.rows.length} rows</p>
          <div className="mt-5 grid grid-cols-3 gap-4">
            {(["date", "description", "amount"] as const).map((field) => (
              <label key={field} className="block">
                <span className="mb-1 block text-xs uppercase tracking-wider text-muted">{field}</span>
                <select className="input" value={map[field]} onChange={(e) => setMap({ ...map, [field]: e.target.value })}>
                  <option value="">— select column —</option>
                  {table.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
            ))}
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={() => setStep("upload")} className="rounded-btn border border-border px-4 py-2.5 text-sm text-ink hover:bg-tag/40">Back</button>
            <PrimaryButton onClick={() => runPreview(buildRowsFromCsv())} disabled={!map.date || !map.description || !map.amount || busy}>{busy ? "Analyzing…" : "Preview"}</PrimaryButton>
          </div>
        </Card>
      )}

      {step === "preview" && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h3 className="font-serif text-xl font-semibold text-ink">Review &amp; import</h3>
              <p className="text-sm text-muted">{selectedCount} selected · {dupCount} duplicate{dupCount === 1 ? "" : "s"}{errCount ? ` · ${errCount} error${errCount === 1 ? "" : "s"}` : ""}</p>
            </div>
            <PrimaryButton onClick={commit} disabled={busy || selectedCount === 0}>{busy ? "Importing…" : `Import ${selectedCount}`}</PrimaryButton>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wider text-muted">
              <th className="px-5 py-3"></th><th className="px-5 py-3">Date</th><th className="px-5 py-3">Description</th>
              <th className="px-5 py-3">Category (Schedule F)</th><th className="px-5 py-3 text-right">Amount</th><th className="px-5 py-3"></th>
            </tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={`border-t border-border ${r.error ? "bg-[#FBF0EE]" : r.duplicate ? "bg-surface-sunken/50" : ""}`}>
                  <td className="px-5 py-3"><input type="checkbox" checked={r.selected} disabled={!!r.error} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, selected: e.target.checked } : x))} /></td>
                  <td className="whitespace-nowrap px-5 py-3 text-ink">{r.date}</td>
                  <td className="px-5 py-3 text-ink">{r.description}</td>
                  <td className="px-5 py-3">
                    <select className="input py-1" value={r.accountCode} onChange={(e) => {
                      const a = accounts.find((x) => x.code === e.target.value);
                      setRows(rows.map((x, j) => j === i ? { ...x, accountCode: e.target.value, accountLabel: a?.label ?? x.accountLabel } : x));
                    }}>
                      {accounts.filter((a) => a.kind === r.kind).map((a) => <option key={a.code} value={a.code}>{a.label}</option>)}
                    </select>
                  </td>
                  <td className="px-5 py-3 text-right"><Money cents={r.amountCents} sign /></td>
                  <td className="px-5 py-3">
                    {r.error ? <span className="inline-flex items-center gap-1 text-xs text-negative"><AlertTriangle size={13} /> {r.error}</span>
                      : r.duplicate ? <span className="rounded-pill bg-tag px-2 py-0.5 text-xs text-muted">duplicate</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {step === "done" && result && (
        <Card className="p-8 text-center">
          <CheckCircle2 size={40} className="mx-auto text-positive" />
          <h3 className="mt-3 font-serif text-2xl font-semibold text-ink">Import complete</h3>
          <p className="mt-1 text-sm text-muted">
            {result.imported} imported · {result.duplicates} duplicate{result.duplicates === 1 ? "" : "s"} skipped
            {result.skipped.length ? ` · ${result.skipped.length} skipped (locked period)` : ""}
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <a href="/transactions" className="rounded-btn bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-deep">View Transactions</a>
            <button onClick={() => { setStep("upload"); setRows([]); setResult(null); }} className="rounded-btn border border-border px-4 py-2.5 text-sm text-ink hover:bg-tag/40">Import another</button>
          </div>
        </Card>
      )}
    </>
  );
}
