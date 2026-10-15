import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Money } from "@/components/ui/money";
import { Table, Th, Td } from "@/components/ui/table";
import { PrintButton } from "@/components/print-button";
import { Upgrade } from "@/components/ui/upgrade";
import { prisma, loadStatementInputs } from "@fl/db";
import { balanceSheetAt, incomeStatement, hasFeature, type BalanceSheet, type IncomeStatement } from "@fl/core";
import { getDemoFarm, getPlan } from "@/lib/data";
import { getCurrentFarm } from "@/lib/session";
import { fmtDate } from "@/lib/format";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * Consolidated report (Business): every farm the user can see, or the current farm's
 * entity group when one is set, side by side with a total. Each farm reports through
 * its own reporting date; transfers between entities aren't eliminated.
 */
export default async function ConsolidatedPage() {
  const farm = await getDemoFarm();
  if (!hasFeature(await getPlan(), "consolidated")) return (<><PageHeader title="Consolidated" /><Upgrade feature="consolidated" title="Consolidated Reporting" /></>);
  const s = await getCurrentFarm();
  const farms = (s?.memberships ?? []).map((m) => m.farm).filter((f) => !farm.entityGroup || f.entityGroup === farm.entityGroup);
  const data = await Promise.all(farms.map(async (f) => {
    const inputs = await loadStatementInputs(prisma, f.id);
    const asOf = inputs.cutoff ?? new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 0));
    const y = asOf.getUTCFullYear();
    const ytd = incomeStatement(inputs.rows, new Date(Date.UTC(y - 1, 11, 31)), asOf);
    const prior = incomeStatement(inputs.rows, new Date(Date.UTC(y - 2, 11, 31)), new Date(Date.UTC(y - 1, 11, 31)));
    return { f, asOf, ytd, prior, bs: balanceSheetAt(inputs, asOf) };
  }));
  const rows: [string, (d: (typeof data)[number]) => bigint, boolean?][] = [
    ["Revenue YTD", (d) => d.ytd.revenueCents], ["Net Farm Income YTD", (d) => d.ytd.netFarmIncomeCents, true],
    ["Revenue Prior Year", (d) => d.prior.revenueCents], ["Net Farm Income Prior Year", (d) => d.prior.netFarmIncomeCents, true],
    ["Cash", (d) => d.bs.cashCents], ["Working Capital", (d) => d.bs.totalCurrentAssetsCents - d.bs.totalCurrentLiabilitiesCents],
    ["Total Assets", (d) => d.bs.totalAssetsCents], ["Total Liabilities", (d) => d.bs.totalLiabilitiesCents],
    ["Owner Equity", (d) => d.bs.totalEquityCents, true], ["Net Worth at Market", (d) => d.bs.marketNetWorthCents, true],
  ];
  return (
    <>
      <Link href="/reports" className="no-print mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft size={15} /> Reports</Link>
      <PageHeader title="Consolidated" subtitle={farm.entityGroup ?? `${data.length} farms`} action={<PrintButton />} />
      <Table minWidth={240 + (data.length + 1) * 150}>
        <thead>
          <tr><Th> </Th>{data.map((d) => <Th key={d.f.id} right className="min-w-[130px] max-w-[160px] align-bottom !whitespace-normal">{d.f.name}</Th>)}<Th right>Total</Th></tr>
          <tr><Th className="normal-case tracking-normal"> </Th>{data.map((d) => <Th key={d.f.id} right className="font-normal normal-case tracking-normal">{fmtDate(d.asOf)}</Th>)}<Th /></tr>
        </thead>
        <tbody>
          {rows.map(([label, f, bold]) => (
            <tr key={label} className="border-t border-border">
              <Td strong={bold} className="min-w-[200px] whitespace-nowrap">{label}</Td>
              {data.map((d) => <Td key={d.f.id} right strong={bold}><Money cents={f(d)} /></Td>)}
              <Td right strong><Money cents={data.reduce((a, d) => a + f(d), 0n)} /></Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
