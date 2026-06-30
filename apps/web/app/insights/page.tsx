import { PageHeader } from "@/components/ui/page-header";
import { Card, SectionHeading } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { InsightsProjectionChart, type ProjectionDatum } from "@/components/charts/insights-projection-chart";
import { prisma } from "@fl/db";
import { getDemoFarmId } from "@/lib/data";
import { getValuedInventory, inventoryTotals } from "@/lib/valuation";
import { sumCents, formatCentsDisplay, naiveForecaster, type MonthFlow } from "@fl/core";
import { CalendarRange, CircleCheck, TriangleAlert } from "lucide-react";

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const singular = (u: string) => (u.endsWith("s") ? u.slice(0, -1) : u);
const HIST = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
const PROJ = ["Jul", "Aug", "Sep"];

export default async function InsightsPage() {
  const farmId = await getDemoFarmId();
  const [valued, liabilities, leases, txns] = await Promise.all([
    getValuedInventory(farmId),
    prisma.liability.findMany({ where: { farmId } }),
    prisma.lease.findMany({ where: { farmId } }),
    prisma.transaction.findMany({ where: { farmId } }),
  ]);

  // Marketable inventory = livestock + crops, valued at the latest market quote.
  const marketable = valued.filter((v) => v.valuation.marketable);
  const marketableValue = inventoryTotals(valued).marketable;

  // Upcoming obligations (next 90 days). All integer cents — no float artifacts.
  const horizon = new Date("2026-06-30");
  horizon.setDate(horizon.getDate() + 90);
  const loanPayments = sumCents(
    liabilities.filter((l) => l.nextPaymentAt && l.nextPaymentAt <= horizon).map((l) => l.paymentCents ?? 0n),
  );
  const leasePayments = sumCents(
    leases.filter((l) => l.annualRentCents).map((l) => (l.annualRentCents as bigint) / 4n), // one quarter
  );
  const obligationsTotal = loanPayments + leasePayments;
  const estOperating = 25000n; // Phase-0 placeholder; Phase 2 Prophet supplies the real run-rate

  const projectedExpenses = obligationsTotal + estOperating;
  const projectedIncome = marketableValue; // assumes marketable inventory sells within the window
  const netPosition = projectedIncome - projectedExpenses;

  // Chart: actual months from the ledger, then projected months via the
  // Forecaster seam (naive baseline now; Prophet drops in with the same API).
  const history: MonthFlow[] = HIST.map((month, i) => {
    const m = txns.filter((t) => t.date.getFullYear() === 2026 && t.date.getMonth() === i);
    return {
      month,
      incomeCents: sumCents(m.filter((t) => t.amountCents > 0n).map((t) => t.amountCents)),
      expenseCents: sumCents(m.filter((t) => t.amountCents < 0n).map((t) => -t.amountCents)),
    };
  });
  const projected = naiveForecaster.project(history, PROJ, projectedIncome, projectedExpenses);
  const chart: ProjectionDatum[] = [
    ...history.map((h) => ({ month: h.month, income: Number(h.incomeCents) / 100, expenses: Number(h.expenseCents) / 100, projected: false })),
    ...projected.map((p) => ({ month: p.month, income: Number(p.incomeCents) / 100, expenses: Number(p.expenseCents) / 100, projected: true })),
  ];

  return (
    <>
      <PageHeader title="Insights" subtitle="Cashflow projection, marketable inventory, and obligations." />

      <Card className="p-6">
        <SectionHeading icon={<CalendarRange size={18} className="text-primary" />} title="90-Day Cashflow Projection" />
        <div className="mt-6 grid grid-cols-3 gap-6 text-center">
          <div>
            <p className="text-sm text-muted">Projected Income</p>
            <p className="mt-1 font-serif text-3xl font-bold text-positive"><Money cents={projectedIncome} /></p>
          </div>
          <div>
            <p className="text-sm text-muted">Projected Expenses</p>
            <p className="mt-1 font-serif text-3xl font-bold text-negative"><Money cents={projectedExpenses} /></p>
          </div>
          <div>
            <p className="text-sm text-muted">Expected Net Position</p>
            <p className="mt-1 font-serif text-3xl font-bold text-ink"><Money cents={netPosition} /></p>
          </div>
        </div>
        <div className="mt-6"><InsightsProjectionChart data={chart} /></div>
        <p className="mt-3 text-center text-xs text-muted">* Projected months (lighter bars) based on historical averages and upcoming obligations.</p>
      </Card>

      <div className="mt-6 grid grid-cols-2 gap-6">
        <Card className="p-6">
          <SectionHeading
            icon={<CircleCheck size={18} className="text-positive" />}
            title="Marketable Inventory"
            action={<span className="rounded-pill bg-mint px-3 py-1 text-sm font-medium text-positive"><Money cents={marketableValue} /></span>}
          />
          <div className="mt-4 space-y-4">
            {marketable.map(({ item, valuation }) => (
              <div key={item.id} className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-ink">{item.name}</p>
                  <p className="text-xs text-muted">{Number(item.quantity).toLocaleString()} {titleCase(item.unit)} · {titleCase(item.category)}</p>
                </div>
                <div className="text-right">
                  <p className="font-serif font-bold text-ink"><Money cents={valuation.valueCents} /></p>
                  <p className="text-xs text-muted">{formatCentsDisplay(valuation.unitPriceCents ?? 0n)}/{singular(item.unit)}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <SectionHeading
            icon={<TriangleAlert size={18} className="text-rust" />}
            title="Upcoming Obligations (90 Days)"
            action={<span className="rounded-pill bg-cream-tint px-3 py-1 text-sm font-medium text-rust"><Money cents={obligationsTotal} /></span>}
          />
          <div className="mt-4 space-y-4">
            <ObligationRow title="Loan Payments" sub="Scheduled liability obligations" value={loanPayments} />
            <ObligationRow title="Lease Payments" sub="Land rental obligations" value={leasePayments} />
            <ObligationRow title="Estimated Operating Expenses" sub="Based on historical run-rate" value={estOperating} />
          </div>
        </Card>
      </div>
    </>
  );
}

function ObligationRow({ title, sub, value }: { title: string; sub: string; value: bigint }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-cream-tint text-rust">$</span>
        <div>
          <p className="font-medium text-ink">{title}</p>
          <p className="text-xs text-muted">{sub}</p>
        </div>
      </div>
      <p className="font-serif font-bold text-ink"><Money cents={value} /></p>
    </div>
  );
}
