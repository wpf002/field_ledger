import { PageHeader } from "@/components/ui/page-header";
import { PrimaryButton } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { Card } from "@/components/ui/card";
import { CategoryPill } from "@/components/ui/category-pill";
import { Money } from "@/components/ui/money";
import { ProgressBar } from "@/components/ui/progress-bar";
import { prisma } from "@fl/db";
import { getDemoFarmId } from "@/lib/data";
import { sumCents, roundCentsToDollar } from "@fl/core";
import { fmtMonthDay } from "@/lib/format";
import { Plus, Calendar } from "lucide-react";

const TYPE_LABEL: Record<string, string> = {
  EQUIPMENT_LOAN: "Equipment Loan",
  OPERATING_LINE: "Operating Line",
  MORTGAGE: "Mortgage",
  OTHER: "Other",
};

/** Monthly interest (integer cents): balance × rate% ÷ 12. */
function monthlyInterestCents(balanceCents: bigint, ratePct: unknown): bigint {
  const bp = BigInt(Math.round(Number(ratePct) * 100)); // basis points
  return (balanceCents * bp) / 10000n / 12n;
}

export default async function LiabilitiesPage() {
  const farmId = await getDemoFarmId();
  const liabilities = await prisma.liability.findMany({ where: { farmId }, orderBy: { createdAt: "asc" } });

  const totalDebt = sumCents(liabilities.map((l) => l.balanceCents));
  const monthlyInterest = sumCents(liabilities.map((l) => monthlyInterestCents(l.balanceCents, l.ratePct)));

  return (
    <>
      <PageHeader
        title="Liabilities"
        subtitle="Manage loans, credit lines, and debt obligations."
        action={<PrimaryButton><Plus size={16} /> Add Liability</PrimaryButton>}
      />

      <div className="grid grid-cols-2 gap-5">
        <StatCard label="Total Outstanding Debt" value={<Money cents={totalDebt} className="text-white" />} sub={`Across ${liabilities.length} active liabilities`} variant="brown" />
        <StatCard label="Est. Monthly Interest" value={<Money cents={-roundCentsToDollar(monthlyInterest)} />} sub="Projected cost of carry" />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-5">
        {liabilities.map((l) => {
          const pctPaid = Math.round(Number(l.originalCents - l.balanceCents) * 100 / Number(l.originalCents));
          return (
            <Card key={l.id} className="p-6">
              <CategoryPill>{TYPE_LABEL[l.type] ?? l.type}</CategoryPill>
              <h3 className="mt-3 font-serif text-2xl font-semibold text-ink">{l.name}</h3>
              {l.lender && <p className="text-sm text-muted">{l.lender}</p>}

              <div className="mt-5 flex items-center justify-between text-sm">
                <span className="text-muted">Balance</span>
                <span className="font-serif text-lg font-bold text-ink"><Money cents={l.balanceCents} /></span>
              </div>
              <div className="mt-2"><ProgressBar pct={pctPaid} /></div>
              <div className="mt-1.5 flex items-center justify-between text-xs text-muted">
                <span>{pctPaid}% Paid</span>
                <span>Original: <Money cents={l.originalCents} /></span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-btn bg-surface-sunken px-4 py-3">
                  <p className="text-xs text-muted">Interest Rate</p>
                  <p className="mt-0.5 font-medium text-ink">{Number(l.ratePct)}%</p>
                </div>
                <div className="rounded-btn bg-surface-sunken px-4 py-3">
                  <p className="text-xs text-muted">Next Payment</p>
                  <p className="mt-0.5 flex items-center gap-1.5 font-medium text-ink">
                    <Calendar size={14} />
                    {l.nextPaymentAt ? fmtMonthDay(l.nextPaymentAt) : "—"}
                  </p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
