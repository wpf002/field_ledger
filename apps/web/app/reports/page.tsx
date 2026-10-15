import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, SectionHeading } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { getDemoFarmId, getPlan } from "@/lib/data";
import { hasFeature } from "@fl/core";
import { getReports, getReportYears } from "@/lib/reports";
import { Receipt, Download, Lock, ArrowLeft, Landmark, FileDown, Printer, Layers } from "lucide-react";

export const dynamic = "force-dynamic";

const API = process.env.NEXT_PUBLIC_API_URL ?? "/api";

function Dl({ farmId, type, year }: { farmId: string; type: string; year: number }) {
  return (
    <a href={`${API}/farms/${farmId}/reports/${type}/export?year=${year}`} className="inline-flex items-center gap-1.5 rounded-btn border border-border px-3 py-1.5 text-xs text-ink hover:bg-tag/40">
      <Download size={13} /> CSV
    </a>
  );
}
const BTN = "inline-flex items-center gap-2 rounded-btn border border-border px-4 py-2.5 text-sm text-ink hover:bg-tag/40";
const BTN_PRIMARY = "inline-flex items-center gap-2 rounded-btn bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-deep";
function ReportCard({ title, icon, allowed, children }: { title: string; icon: React.ReactNode; allowed: boolean; children: React.ReactNode }) {
  return (
    <Card className="p-6">
      <SectionHeading icon={icon} title={title} />
      <div className="mt-4 flex flex-wrap gap-2">{allowed ? children : <Link href="/account#plan" className={BTN}><Lock size={14} /> Business Plan</Link>}</div>
    </Card>
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
  const { years } = await getReportYears(farmId);
  const year = years.includes(Number(searchParams.year)) ? Number(searchParams.year) : years[0]!;
  const { scheduleF, locked } = await getReports(farmId, year);
  const YEARS = years;
  const business = hasFeature(await getPlan(), "lender_reporting");

  return (
    <>
      <a href="/" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft size={15} /> Back to Dashboard</a>
      <PageHeader
        title="Tax & Reports"
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
          <Lock size={14} /> {year} Locked
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
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

        <div className="space-y-6">
          <ReportCard title="Lender Package" allowed={business} icon={<Landmark size={18} className="text-primary" />}>
            <Link href={`/reports/lender?year=${year}`} className={BTN_PRIMARY}><Printer size={15} /> Open Package</Link>
          </ReportCard>
          <ReportCard title="Consolidated" allowed={business} icon={<Layers size={18} className="text-primary" />}>
            <Link href="/reports/consolidated" className={BTN}><Layers size={15} /> All Farms</Link>
          </ReportCard>
          <ReportCard title="Tax Files" allowed={business} icon={<FileDown size={18} className="text-primary" />}>
            <a href={`${API}/farms/${farmId}/reports/schedule-f/txf?year=${year}`} title="TurboTax or H&R Block desktop: File → Import → From Accounting Software. Enter depreciation through Form 4562." className={BTN_PRIMARY}>
              <FileDown size={15} /> TurboTax File (.txf)
            </a>
            <Link href={`/reports/schedule-f?year=${year}`} className={BTN}><Printer size={15} /> Worksheet</Link>
            <a href={`${API}/farms/${farmId}/reports/schedule-f/export?year=${year}`} className={BTN}><Download size={15} /> Worksheet CSV</a>
          </ReportCard>
        </div>
      </div>
    </>
  );
}
