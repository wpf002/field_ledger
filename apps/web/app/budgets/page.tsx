import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { ProgressBar } from "@/components/ui/progress-bar";
import { ExpenseBudgets } from "@/components/expense-budgets";
import { BudgetBar } from "@/components/budget-bar";
import { SetBudgetButton } from "@/components/set-budget-button";
import { prisma } from "@fl/db";
import { getDemoFarmId } from "@/lib/data";
import { getBudgetStatuses } from "@/lib/budgets";
import { fmtMonthYear } from "@/lib/format";
import { Clock, Target, Plus } from "lucide-react";

export const dynamic = "force-dynamic";

const monthYear = (date: Date | null) => (date ? fmtMonthYear(date) : "");
const year = new Date().getUTCFullYear();

export default async function BudgetsPage() {
  const farmId = await getDemoFarmId();
  const [goals, budgets] = await Promise.all([
    prisma.financialGoal.findMany({ where: { farmId }, orderBy: { name: "asc" } }),
    getBudgetStatuses(farmId),
  ]);
  const monthly = budgets.filter((b) => b.period === "MONTHLY");
  const annual = budgets.filter((b) => b.period === "ANNUAL");
  const list = (rows: typeof budgets, label: string) =>
    rows.length ? <div className="space-y-5">{rows.map((b) => <BudgetBar key={b.id} status={b.status} />)}</div>
      : <p className="py-6 text-center text-sm text-muted">No {label} budgets set for {year}.</p>;

  return (
    <>
      <PageHeader title="Budgets & Goals" subtitle="Plan your expenses and track financial targets." />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
        {/* Expense budgets */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-serif text-xl font-semibold text-ink"><Clock size={18} /> Expense Budgets</h3>
            <SetBudgetButton farmId={farmId} />
          </div>
          <ExpenseBudgets monthly={list(monthly, "monthly")} annual={list(annual, "annual")} />
        </div>

        {/* Financial goals */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-serif text-xl font-semibold text-ink"><Target size={18} className="text-positive" /> Financial Goals</h3>
            <button className="flex items-center justify-center rounded-btn bg-primary p-2 text-white hover:bg-primary-deep"><Plus size={16} /></button>
          </div>
          <div className="space-y-4">
            {goals.map((g) => {
              const pct = Math.round(Number(g.currentCents) * 100 / Number(g.targetCents));
              return (
                <Card key={g.id} className="p-5">
                  <p className="font-medium text-ink">{g.name}</p>
                  <p className="text-xs text-muted">{g.kind === "savings" ? "Savings" : "Income Target"}</p>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="font-serif text-2xl font-bold text-ink"><Money cents={g.currentCents} /></span>
                    <span className="text-sm text-muted">of <Money cents={g.targetCents} /></span>
                  </div>
                  <div className="mt-3"><ProgressBar pct={pct} /></div>
                  <div className="mt-1.5 flex items-center justify-between text-xs text-muted">
                    <span>{pct}% Complete</span>
                    {g.dueAt && <span>Due: {monthYear(g.dueAt)}</span>}
                  </div>
                  {g.note && <p className="mt-3 text-sm italic text-muted">&ldquo;{g.note}&rdquo;</p>}
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
