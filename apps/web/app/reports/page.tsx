import { PageHeader } from "@/components/ui/page-header";
import { Card, SectionHeading } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { getDemoFarmId } from "@/lib/data";
import { getReports } from "@/lib/reports";
import { FileText, Receipt, TrendingUp, Tractor, Download, Lock, ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const YEARS = [2026, 2023];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function Dl({ farmId, type, year }: { farmId: string; type: string; year: number }) {
  return (
    <a href={`${API}/farms/${farmId}/reports/${type}/export?year=${year}`} className="inline-flex items-center gap-1.5 rounded-btn border border-border px-3 py-1.5 text-xs text-ink hover:bg-tag/40">
      <Download size={13} /> CSV
    </a>
  );
}
const LineRow = ({ label, sub, cents, bold }: { label: string; sub?: string; cents: bigint; bold?: boolean }) => (
  <div className={`flex items-center justify-between py-1.5 text-sm ${bold ? "border-t border-border font-semibold text-ink" : ""}`}>
    <span className={bold ? "" : "text-ink"}>{label}{sub && <span className="ml-2 text-xs text-muted">{sub}</span>}</span>
    <Money cents={cents} />
  </div>
);

export default async function ReportsPage({ searchParams }: { searchParams: { year?: string } }) {
  const farmId = await getDemoFarmId();
  const year = YEARS.includes(Number(searchParams.year)) ? Number(searchParams.year) : 2026;
  const { pnl, scheduleF, cashFlow, enterprises, locked } = await getReports(farmId, year);

  return (
    <>
      <a href="/" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft size={15} /> Back to Dashboard</a>
      <PageHeader
        title="Reports"
        subtitle="Profit & loss, Schedule F, cash flow, and enterprise profitability."
        action={
          <div className="flex items-center gap-2">
            {YEARS.map((y) => (
              <a key={y} href={`/reports?year=${y}`} className={`rounded-btn px-3 py-2 text-sm ${y === year ? "bg-primary text-white" : "border border-border text-ink hover:bg-tag/40"}`}>{y}</a>
            ))}
          </div>
        }
      />

      {locked && (
        <div className="mb-6 inline-flex items-center gap-2 rounded-btn bg-mint px-3 py-2 text-sm text-primary">
          <Lock size={14} /> {year} is a locked accounting period — these figures are final.
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* P&L */}
        <Card className="p-6">
          <SectionHeading icon={<FileText size={18} className="text-primary" />} title="Profit & Loss" action={<Dl farmId={farmId} type="pnl" year={year} />} />
          <p className="mt-3 text-xs uppercase tracking-wider text-muted">Income</p>
          {pnl.income.map((l) => <LineRow key={l.code} label={l.label} sub={l.scheduleFLine} cents={l.totalCents} />)}
          <LineRow label="Total Income" cents={pnl.totalIncomeCents} bold />
          <p className="mt-4 text-xs uppercase tracking-wider text-muted">Expenses</p>
          {pnl.expenses.map((l) => <LineRow key={l.code} label={l.label} sub={l.scheduleFLine} cents={l.totalCents} />)}
          <LineRow label="Total Expenses" cents={pnl.totalExpenseCents} bold />
          <div className="mt-3 flex items-center justify-between rounded-btn bg-surface-sunken px-4 py-3">
            <span className="font-serif text-lg font-semibold text-ink">Net Profit</span>
            <span className="font-serif text-lg font-bold"><Money cents={pnl.netCents} /></span>
          </div>
        </Card>

        {/* Schedule F */}
        <Card className="p-6">
          <SectionHeading icon={<Receipt size={18} className="text-primary" />} title="Schedule F Summary" action={<Dl farmId={farmId} type="schedule-f" year={year} />} />
          <p className="mt-3 text-xs uppercase tracking-wider text-muted">Part I — Income</p>
          {scheduleF.income.map((l) => <LineRow key={l.line} label={l.label} sub={l.line} cents={l.totalCents} />)}
          <LineRow label="Gross Income" cents={scheduleF.totalIncomeCents} bold />
          <p className="mt-4 text-xs uppercase tracking-wider text-muted">Part II — Expenses</p>
          {scheduleF.expenses.map((l) => <LineRow key={l.line} label={l.label} sub={l.line} cents={l.totalCents} />)}
          <LineRow label="Total Expenses" cents={scheduleF.totalExpenseCents} bold />
          <div className="mt-3 flex items-center justify-between rounded-btn bg-surface-sunken px-4 py-3">
            <span className="font-serif text-lg font-semibold text-ink">Net Farm Profit</span>
            <span className="font-serif text-lg font-bold"><Money cents={scheduleF.netFarmProfitCents} /></span>
          </div>
        </Card>

        {/* Cash flow */}
        <Card className="p-6">
          <SectionHeading icon={<TrendingUp size={18} className="text-primary" />} title="Cash Flow Statement" action={<Dl farmId={farmId} type="cash-flow" year={year} />} />
          <table className="mt-4 w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wider text-muted"><th className="py-1.5">Month</th><th className="py-1.5 text-right">In</th><th className="py-1.5 text-right">Out</th><th className="py-1.5 text-right">Net</th></tr></thead>
            <tbody>
              {cashFlow.months.filter((m) => m.inflowCents || m.outflowCents).map((m) => (
                <tr key={m.month} className="border-t border-border">
                  <td className="py-1.5 text-ink">{MONTHS[m.month - 1]}</td>
                  <td className="py-1.5 text-right text-positive"><Money cents={m.inflowCents} /></td>
                  <td className="py-1.5 text-right text-negative"><Money cents={m.outflowCents} /></td>
                  <td className="py-1.5 text-right"><Money cents={m.netCents} /></td>
                </tr>
              ))}
              <tr className="border-t border-border font-semibold text-ink">
                <td className="py-2">Total</td>
                <td className="py-2 text-right"><Money cents={cashFlow.inflowCents} /></td>
                <td className="py-2 text-right"><Money cents={cashFlow.outflowCents} /></td>
                <td className="py-2 text-right"><Money cents={cashFlow.netCents} /></td>
              </tr>
            </tbody>
          </table>
        </Card>

        {/* Enterprise profitability */}
        <Card className="p-6">
          <SectionHeading icon={<Tractor size={18} className="text-primary" />} title="Enterprise Profitability" action={<Dl farmId={farmId} type="enterprises" year={year} />} />
          <div className="mt-4 space-y-3">
            {enterprises.map((e) => (
              <div key={e.name} className="rounded-btn bg-surface-sunken px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-ink">{e.name}</span>
                  <span className="font-serif font-bold"><Money cents={e.netCents} /></span>
                </div>
                <div className="mt-1 flex gap-4 text-xs text-muted">
                  <span>Income <Money cents={e.incomeCents} className="text-xs" /></span>
                  <span>Expense <Money cents={e.expenseCents} className="text-xs" /></span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
