import { StatCard } from "@/components/ui/stat-card";
import { HeroBand } from "@/components/ui/hero-band";
import { Money } from "@/components/ui/money";
import { Card, SectionHeading } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { CashFlowChart, type CashFlowDatum } from "@/components/charts/cash-flow-chart";
import { prisma } from "@fl/db";
import { getDemoFarmId } from "@/lib/data";
import { getValuedInventory, inventoryTotals } from "@/lib/valuation";
import { getBudgetStatuses } from "@/lib/budgets";
import { BudgetBar } from "@/components/budget-bar";
import { sumCents } from "@fl/core";
import { fmtDate } from "@/lib/format";
import { TrendingUp, TrendingDown, DollarSign, Wallet, CreditCard, ArrowUpRight, ArrowDownRight, Sparkles, FileText } from "lucide-react";
import Link from "next/link";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];

export default async function Dashboard() {
  const farmId = await getDemoFarmId();
  const [txns, valued, liabilities, budgetStatuses] = await Promise.all([
    prisma.transaction.findMany({ where: { farmId }, orderBy: { date: "desc" }, include: { account: true } }),
    getValuedInventory(farmId),
    prisma.liability.findMany({ where: { farmId } }),
    getBudgetStatuses(farmId),
  ]);

  const income = sumCents(txns.filter((t) => t.amountCents > 0n).map((t) => t.amountCents));
  const expenses = sumCents(txns.filter((t) => t.amountCents < 0n).map((t) => -t.amountCents));
  const netProfit = income - expenses;
  const inventoryValue = inventoryTotals(valued).assets; // mark-to-market + depreciation
  const totalLiabilities = sumCents(liabilities.map((l) => l.balanceCents));
  const netWorth = inventoryValue - totalLiabilities;

  // Cash flow: current year (2026) by month, whole dollars for charting.
  const year = 2026;
  const cashFlow: CashFlowDatum[] = MONTHS.map((month, i) => {
    const monthTxns = txns.filter((t) => t.date.getFullYear() === year && t.date.getMonth() === i);
    const inc = sumCents(monthTxns.filter((t) => t.amountCents > 0n).map((t) => t.amountCents));
    const exp = sumCents(monthTxns.filter((t) => t.amountCents < 0n).map((t) => -t.amountCents));
    return { month, income: Number(inc) / 100, expenses: Number(exp) / 100 };
  });

  const healthBudgets = budgetStatuses.slice(0, 4);
  const recent = txns.slice(0, 5);

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle="Financial health at a glance."
        action={<Link href="/reports" className="inline-flex items-center gap-2 rounded-btn border border-border px-4 py-2.5 text-sm text-ink hover:bg-tag/40"><FileText size={15} /> Reports</Link>}
      />

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Four white stats as a 2×2 block */}
        <div className="grid grid-cols-2 gap-5 lg:col-span-2">
          <StatCard label="Total Income" value={<Money cents={income} />} icon={<TrendingUp className="text-positive" size={18} />} />
          <StatCard label="Total Expenses" value={<Money cents={expenses} />} icon={<TrendingDown className="text-negative" size={18} />} />
          <StatCard label="Net Profit" value={<Money cents={netProfit} />} icon={<DollarSign className="text-positive" size={18} />} />
          <StatCard label="Total Liabilities" value={<Money cents={totalLiabilities} />} icon={<CreditCard className="text-negative" size={18} />} />
        </div>
        {/* Green inventory card fills the full height of the 2×2 block */}
        <StatCard fill label="Total Inventory Value" value={<Money cents={inventoryValue} />} sub={`Across ${valued.length} active lots/items`} variant="primary" icon={<Wallet className="text-white/80" size={18} />} />
      </div>

      <div className="mt-6">
        <HeroBand title="Estimated Net Worth" subtitle="Calculated based on tracked inventory assets minus outstanding liabilities." value={<Money cents={netWorth} className="text-white" />} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Row 1: Cash Flow ↔ Recent Activity (equal height) */}
        <Card className="p-6 lg:col-span-2">
          <SectionHeading title="Cash Flow" />
          <div className="mt-4">
            <CashFlowChart data={cashFlow} />
          </div>
        </Card>

        <Card className="flex flex-col p-6">
          <SectionHeading title="Recent Activity" />
          <div className="mt-4 flex-1 space-y-5">
            {recent.map((t) => {
              const positive = t.amountCents > 0n;
              return (
                <div key={t.id} className="flex items-start gap-3">
                  <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${positive ? "bg-mint text-positive" : "bg-[#F3E3E0] text-negative"}`}>
                    {positive ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{t.description}</p>
                    <p className="text-xs text-muted">{t.account.label} · {fmtDate(t.date)}</p>
                  </div>
                  <Money cents={t.amountCents} sign className="text-sm" />
                </div>
              );
            })}
          </div>
        </Card>

        {/* Row 2: Budget Health ↔ AI Insights (equal height) */}
        <Card className="p-6 lg:col-span-2">
          <SectionHeading title="Budget Health" action={<a href="/budgets" className="text-sm text-muted hover:text-ink">View All</a>} />
          <div className="mt-4 space-y-4">
            {healthBudgets.map((b) => <BudgetBar key={b.id} status={b.status} />)}
            {healthBudgets.length === 0 && <p className="pt-2 text-center text-sm text-muted">No budgets set yet.</p>}
          </div>
        </Card>

        <Card className="flex flex-col p-6">
          <SectionHeading icon={<Sparkles size={18} className="text-rust" />} title="AI Insights" action={<button className="rounded-btn border border-border px-3 py-1.5 text-sm text-ink hover:bg-tag/40">Generate</button>} />
          <div className="flex flex-1 items-center justify-center">
            <p className="py-6 text-center text-sm text-muted">Click Generate to get AI-powered insights about your operation.</p>
          </div>
        </Card>
      </div>
    </>
  );
}
