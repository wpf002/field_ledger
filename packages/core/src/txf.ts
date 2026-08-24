/**
 * TXF (Tax Exchange Format, v042) export for Schedule F. TXF is the plain-text
 * format that TurboTax and H&R Block desktop software import (File → Import →
 * From Accounting Software). We emit one summary record per TXF reference
 * number with the year's total for that category.
 *
 * Reference numbers come from the TXF v042 standard (taxdataexchange.org) and
 * live on each category in SCHEDULE_F. Depreciation has no Schedule F TXF code
 * (it flows through Form 4562), so its total is returned as `unmappedCents` for
 * the caller to surface rather than silently dropped.
 */
import { SCHEDULE_F } from "./schedule-f.js";
import type { ReportTxn } from "./reports.js";

const CRLF = "\r\n"; // TXF is a DOS-era format; desktop importers expect CRLF.

/** Integer cents → plain dollar string, e.g. 1234567n → "12345.67". */
function dollars(cents: bigint): string {
  const abs = cents < 0n ? -cents : cents;
  return `${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
}

function mmddyyyy(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())}/${d.getUTCFullYear()}`;
}

export type TxfResult = { txf: string; mappedRefs: number; unmappedCents: bigint };

/** Build a TXF v042 file of `year`'s Schedule F totals grouped by TXF ref number.
 *  Amounts are positive magnitudes (each ref is inherently income or expense). */
export function scheduleFToTxf(txns: ReportTxn[], year: number, opts: { software?: string; date?: Date } = {}): TxfResult {
  const software = opts.software ?? "Acreflow";
  const asOf = opts.date ?? new Date();

  const byRef = new Map<number, bigint>();
  let unmappedCents = 0n;
  for (const t of txns) {
    if (t.date.getUTCFullYear() !== year) continue;
    const sf = SCHEDULE_F[t.account.scheduleFCode];
    if (!sf) continue;
    const magnitude = t.amountCents < 0n ? -t.amountCents : t.amountCents;
    if (sf.txf == null) { unmappedCents += magnitude; continue; }
    byRef.set(sf.txf, (byRef.get(sf.txf) ?? 0n) + magnitude);
  }

  const lines: string[] = ["V042", `A${software}`, `D${mmddyyyy(asOf)}`, "^"];
  for (const ref of [...byRef.keys()].sort((a, b) => a - b)) {
    lines.push("TS", `N${ref}`, "C1", "L1", `$${dollars(byRef.get(ref)!)}`, "^");
  }
  return { txf: lines.join(CRLF) + CRLF, mappedRefs: byRef.size, unmappedCents };
}
