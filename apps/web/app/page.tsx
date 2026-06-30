import { StatCard } from "@/components/ui/stat-card";
import { HeroBand } from "@/components/ui/hero-band";
import { Money } from "@/components/ui/money";
import { Card, SectionHeading } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { PageHeader } from "@/components/ui/page-header";
import { CashFlowChart, type CashFlowDatum } from "@/components/charts/cash-flow-chart";
import { prisma } from "@fl/db";
import { getDemoFarmId } from "@/lib/data";
import { sumCents } from "@fl/core";
import { fmtDate } from "@/lib/format";
import { TrendingUp, TrendingDown, DollarSign, Wallet, CreditCard, ArrowUpRight, ArrowDownRight, Sparkles } from "lucide-react";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];

export default async function Dashboard() {
  const farmId = await getDemoFarmId();
  const [txns, inventory, liabilities, budgets, accounts] = await Promise.all([
    prisma.transaction.findMany({ where: { farmId }, orderBy: { date: "desc" }, include: { account: true } }),
    prisma.inventoryItem.findMany({ where: { farmId } }),
    prisma.liability.findMany({ where: { farmId } }),
    prisma.budget.findMany({ where: { farmId } }),
    prisma.account.findMany({ where: { farmId } }),
  ]);

  const income = sumCents(txns.filter((t) => t.amountCents > 0n).map((t) => t.amountCents));
  const expenses = sumCents(txns.filter((t) => t.amountCents < 0n).map((t) => -t.amountCents));
  const netProfit = income - expenses;
  const inventoryValue = sumCents(inventory.map((i) => i.estValueCents ?? 0n));
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

  const labelFor = (code: string) => accounts.find((a) => a.code === code)?.label ?? code;
  const recent = txns.slice(0, 4);

  return (
    <>
      <PageHeader title="Overview" subtitle="Financial health at a glance." />

      <div className="grid grid-cols-4 gap-5">
        <StatCard label="Total Income" value={<Money cents={income} />} icon={<TrendingUp className="text-positive" size={18} />} />
        <StatCard label="Total Expenses" value={<Money cents={expenses} />} icon={<TrendingDown className="text-negative" size={18} />} />
        <StatCard label="Net Profit" value={<Money cents={netProfit} />} icon={<DollarSign className="text-positive" size={18} />} />
        <StatCard label="Total Inventory Value" value={<Money cents={inventoryValue} />} sub={`Across ${inventory.length} active lots/items`} variant="primary" icon={<Wallet className="text-white/80" size={18} />} />
      </div>
      <div className="grid grid-cols-4 gap-5 mt-5">
        <StatCard label="Total Liabilities" value={<Money cents={totalLiabilities} />} icon={<CreditCard className="text-negative" size={18} />} />
      </div>

      <div className="mt-6">
        <HeroBand title="Estimated Net Worth" subtitle="Calculated based on tracked inventory assets minus outstanding liabilities." value={<Money cents={netWorth} className="text-white" />} />
      </div>

      <div className="mt-6 grid grid-cols-3 gap-6">
        {/* left column */}
        <div className="col-span-2 space-y-6">
          <Card className="p-6">
            <SectionHeading title="Cash Flow" />
            <div className="mt-4">
              <CashFlowChart data={cashFlow} />
            </div>
          </Card>

          <Card className="p-6">
            <SectionHeading title="Budget Health" action={<a href="/budgets" className="text-sm text-muted hover:text-ink">View All</a>} />
            <div className="mt-4 space-y-4">
              {budgets.map((b) => (
                <div key={b.id}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-ink">{labelFor(b.accountCode)}</span>
                    <span className="text-muted">{b.period === "MONTHLY" ? "Monthly" : "Annual"} Budget: <Money cents={b.amountCents} /></span>
                  </div>
                  <div className="mt-2"><ProgressBar pct={0} /></div>
                </div>
              ))}
              <p className="pt-2 text-center text-sm text-muted">Visit Budgets page for detailed analysis.</p>
            </div>
          </Card>
        </div>

        {/* right column */}
        <div className="col-span-1 space-y-6">
          <Card className="p-6">
            <SectionHeading title="Recent Activity" />
            <div className="mt-4 space-y-5">
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

          <Card className="p-6">
            <SectionHeading icon={<Sparkles size={18} className="text-rust" />} title="AI Insights" action={<button className="rounded-btn border border-border px-3 py-1.5 text-sm text-ink hover:bg-tag/40">Generate</button>} />
            <p className="mt-6 text-center text-sm text-muted">Click Generate to get AI-powered insights about your operation.</p>
          </Card>
        </div>
      </div>
    </>
  );
}
