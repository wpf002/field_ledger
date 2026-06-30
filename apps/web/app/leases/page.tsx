import { PageHeader } from "@/components/ui/page-header";
import { PrimaryButton } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { Card } from "@/components/ui/card";
import { CategoryPill } from "@/components/ui/category-pill";
import { Money } from "@/components/ui/money";
import { prisma } from "@fl/db";
import { getDemoFarmId } from "@/lib/data";
import { sumCents } from "@fl/core";
import { utcYear } from "@/lib/format";
import { Plus, User, LandPlot, Calendar, AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function LeasesPage() {
  const farmId = await getDemoFarmId();
  const leases = await prisma.lease.findMany({ where: { farmId }, orderBy: { createdAt: "asc" } });

  const totalAcres = leases.reduce((a, l) => a + Number(l.acres), 0);
  const totalAnnualRent = sumCents(leases.map((l) => l.annualRentCents ?? 0n));

  return (
    <>
      <PageHeader
        title="Lease Agreements"
        subtitle="Manage leased land and property agreements."
        action={<PrimaryButton><Plus size={16} /> Add Lease</PrimaryButton>}
      />

      <div className="grid grid-cols-2 gap-5">
        <StatCard label="Total Leased Acreage" value={<span>{totalAcres.toLocaleString()} <span className="text-2xl font-normal">ac</span></span>} sub={`Across ${leases.length} agreements`} variant="brown" />
        <StatCard label="Total Annual Rent" value={<Money cents={totalAnnualRent} />} sub="Base cash rent costs" />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-5">
        {leases.map((l) => {
          const expired = l.termEnd < new Date();
          return (
          <Card key={l.id} className={`p-6 ${expired ? "ring-1 ring-negative/30" : ""}`}>
            <div className="flex items-start justify-between">
              <CategoryPill>{l.type === "CASH_RENT" ? "Cash Rent" : "Crop Share"}</CategoryPill>
              {expired && (
                <span className="inline-flex items-center gap-1 rounded-pill bg-[#F3E3E0] px-2.5 py-0.5 text-xs font-medium text-negative">
                  <AlertTriangle size={12} /> Expired
                </span>
              )}
            </div>
            <h3 className="mt-3 font-serif text-2xl font-semibold text-ink">{l.name}</h3>
            <div className="mt-3 flex items-center justify-between text-sm text-muted">
              <span className="flex items-center gap-2"><User size={15} /> {l.lessor}</span>
              <span className="flex items-center gap-2"><LandPlot size={15} /> {Number(l.acres).toLocaleString()} Acres</span>
            </div>

            <div className="mt-5 space-y-3 border-t border-border pt-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted">Term</span>
                <span className="flex items-center gap-1.5 text-ink"><Calendar size={14} /> {utcYear(l.termStart)} - {utcYear(l.termEnd)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Payment</span>
                <span className="font-medium text-ink">
                  {l.annualRentCents ? <><Money cents={l.annualRentCents} /> / annually</> : "Crop Share"}
                </span>
              </div>
            </div>
          </Card>
          );
        })}
      </div>
    </>
  );
}
