import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { PrintButton } from "@/components/print-button";
import { getDemoFarm } from "@/lib/data";
import { getReports } from "@/lib/reports";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";
const YEARS = [2026, 2023];

/** Printable Schedule F worksheet — a 1:1 map to the TurboTax / H&R Block
 *  "Farm Income (Schedule F)" interview lines. Print → Save as PDF. */
export default async function ScheduleFWorksheet({ searchParams }: { searchParams: { year?: string } }) {
  const farm = await getDemoFarm();
  const year = YEARS.includes(Number(searchParams.year)) ? Number(searchParams.year) : 2026;
  const { scheduleF } = await getReports(farm.id, year);
  const hasDepreciation = scheduleF.expenses.some((l) => l.line === "F-14");

  const Row = ({ line, label, cents }: { line: string; label: string; cents: bigint }) => (
    <tr className="border-b border-border">
      <td className="w-16 py-2 text-muted">{line.replace(/^F-/, "")}</td>
      <td className="py-2 text-ink">{label}</td>
      <td className="py-2 text-right tabular-nums text-ink"><Money cents={cents} /></td>
    </tr>
  );

  return (
    <div className="mx-auto max-w-2xl">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href="/reports" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft size={15} /> Back to Reports</Link>
        <PrintButton />
      </div>

      <Card className="p-10">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-serif text-3xl font-bold text-primary">Schedule F Worksheet</h1>
            <p className="text-sm text-muted">{farm.name} · Tax year {year}</p>
          </div>
          <p className="text-right text-xs text-muted">Profit or Loss From Farming<br />(Form 1040, Schedule F)</p>
        </div>

        <p className="mt-6 text-xs uppercase tracking-wider text-muted">Part I — Farm Income</p>
        <table className="mt-2 w-full text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wider text-muted"><th className="py-1">Line</th><th className="py-1">Description</th><th className="py-1 text-right">Amount</th></tr></thead>
          <tbody>
            {scheduleF.income.map((l) => <Row key={l.line} line={l.line} label={l.label} cents={l.totalCents} />)}
            <tr className="font-semibold text-ink"><td className="py-2" /><td className="py-2">Gross income (line 9)</td><td className="py-2 text-right tabular-nums"><Money cents={scheduleF.totalIncomeCents} /></td></tr>
          </tbody>
        </table>

        <p className="mt-8 text-xs uppercase tracking-wider text-muted">Part II — Farm Expenses</p>
        <table className="mt-2 w-full text-sm">
          <tbody>
            {scheduleF.expenses.map((l) => <Row key={l.line} line={l.line} label={l.label} cents={l.totalCents} />)}
            <tr className="font-semibold text-ink"><td className="py-2" /><td className="py-2">Total expenses (line 33)</td><td className="py-2 text-right tabular-nums"><Money cents={scheduleF.totalExpenseCents} /></td></tr>
          </tbody>
        </table>

        <div className="mt-6 flex items-center justify-between border-t-2 border-primary pt-3">
          <span className="font-serif text-lg font-semibold text-ink">Net farm profit / (loss) — line 34</span>
          <span className="font-serif text-2xl font-bold text-ink"><Money cents={scheduleF.netFarmProfitCents} /></span>
        </div>

        <div className="mt-8 space-y-1 text-xs text-muted">
          <p>Enter each amount on the matching line of Schedule F in TurboTax, H&amp;R Block, or your tax preparer&rsquo;s software.</p>
          {hasDepreciation && <p><span className="font-medium text-ink">Depreciation (line 14)</span> is shown for reference — enter it through your tax software&rsquo;s asset / Form 4562 flow, not as a direct expense.</p>}
          <p>Figures are from your Acreflow ledger; review before filing.</p>
        </div>
      </Card>
    </div>
  );
}
