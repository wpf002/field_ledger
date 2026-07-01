import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, SectionHeading } from "@/components/ui/card";
import { CategoryPill } from "@/components/ui/category-pill";
import { Money } from "@/components/ui/money";
import { ProgressBar } from "@/components/ui/progress-bar";
import { LiabilitySchedule } from "@/components/liability-schedule";
import { AddLiabilityButton } from "@/components/add-liability-button";
import { EmptyState } from "@/components/ui/empty-state";
import { prisma } from "@fl/db";
import { getDemoFarmId, getCurrentRole, canWrite } from "@/lib/data";
import { sumCents, roundCentsToDollar } from "@fl/core";
import { fmtMonthDay } from "@/lib/format";
import { Calendar, CalendarClock, Wallet } from "lucide-react";

export const dynamic = "force-dynamic";

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
  const canEdit = canWrite(await getCurrentRole());
  const liabilities = await prisma.liability.findMany({ where: { farmId }, orderBy: { createdAt: "asc" } });

  const totalDebt = sumCents(liabilities.map((l) => l.balanceCents));
  const monthlyInterest = sumCents(liabilities.map((l) => monthlyInterestCents(l.balanceCents, l.ratePct)));
  const upcoming = liabilities
    .filter((l) => l.nextPaymentAt)
    .sort((a, b) => a.nextPaymentAt!.getTime() - b.nextPaymentAt!.getTime());

  return (
    <>
      <PageHeader
        title="Liabilities"
        subtitle="Manage loans, credit lines, and debt obligations."
        action={canEdit ? <AddLiabilityButton farmId={farmId} /> : undefined}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <StatCard label="Total Outstanding Debt" value={<Money cents={totalDebt} className="text-white" />} sub={`Across ${liabilities.length} active liabilities`} variant="brown" />
        <StatCard label="Est. Monthly Interest" value={<Money cents={-roundCentsToDollar(monthlyInterest)} />} sub="Projected cost of carry" />
      </div>

      {liabilities.length === 0 && (
        <div className="mt-6"><EmptyState icon={<Wallet size={22} />} title="No liabilities tracked" hint="Add loans and credit lines to see balances, interest, and upcoming payments." action={canEdit ? <AddLiabilityButton farmId={farmId} /> : undefined} /></div>
      )}

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
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

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
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

              <LiabilitySchedule farmId={farmId} id={l.id} name={l.name} nextPaymentAt={l.nextPaymentAt?.toISOString() ?? null} />
            </Card>
          );
        })}
      </div>

      {upcoming.length > 0 && (
        <Card className="mt-6 p-6">
          <SectionHeading icon={<CalendarClock size={18} className="text-primary" />} title="Upcoming Payments" />
          <div className="mt-2 divide-y divide-border">
            {upcoming.map((l) => (
              <div key={l.id} className="flex items-center justify-between py-3.5">
                <div>
                  <p className="text-sm font-medium text-ink">{l.name}</p>
                  <p className="text-xs text-muted">{l.lender ?? TYPE_LABEL[l.type]} · {Number(l.ratePct)}% APR · est. interest <Money cents={roundCentsToDollar(monthlyInterestCents(l.balanceCents, l.ratePct))} />/mo</p>
                </div>
                <div className="text-right">
                  <p className="flex items-center justify-end gap-1.5 text-sm font-medium text-ink"><Calendar size={13} className="text-muted" /> {fmtMonthDay(l.nextPaymentAt!)}</p>
                  <p className="text-xs text-muted">Balance <Money cents={l.balanceCents} /></p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
