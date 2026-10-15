import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { Table, Th, Td } from "@/components/ui/table";
import { PrintButton } from "@/components/print-button";
import { Upgrade } from "@/components/ui/upgrade";
import { prisma } from "@fl/db";
import { balanceSheetAt, incomeStatement, financialRatios, ratioInputsFor, healthScore, hasFeature, type BalanceSheet, type IncomeStatement } from "@fl/core";
import { getDemoFarm, getPlan } from "@/lib/data";
import { getStatementContext } from "@/lib/statements";
import { fmtDate } from "@/lib/format";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

const fmt = (v: number | null, kind: "ratio" | "pct") => (v == null || !Number.isFinite(v) ? "–" : kind === "pct" ? `${(v * 100).toFixed(1)}%` : v.toFixed(2));
const ye = (y: number) => new Date(Date.UTC(y, 11, 31));

/**
 * Lender package (Business): what an ag lender asks for at renewal. Three years of
 * income, balance sheets at the last two year-ends and the reporting date, the FFSC
 * ratios, repayment capacity, and the debt schedule. Prints to PDF.
 */
export default async function LenderPage({ searchParams }: { searchParams: { year?: string } }) {
  const farm = await getDemoFarm();
  if (!hasFeature(await getPlan(), "lender_reporting")) return (<><PageHeader title="Lender Package" /><Upgrade feature="lender_reporting" title="Lender Package" /></>);
  const { inputs, asOf } = await getStatementContext(farm.id);
  const lastFull = asOf.getUTCMonth() === 11 ? asOf.getUTCFullYear() : asOf.getUTCFullYear() - 1;
  const year = Math.min(Number(searchParams.year) || lastFull, lastFull);
  const years = [year - 2, year - 1, year].filter((y) => ye(y) > inputs.opening.asOf);
  const is: [string, IncomeStatement][] = years.map((y) => [String(y), incomeStatement(inputs.rows, ye(y - 1), ye(y))]);
  if (asOf > ye(year)) is.push([`YTD ${fmtDate(asOf)}`, incomeStatement(inputs.rows, ye(asOf.getUTCFullYear() - 1), asOf)]);
  const bsDates = [ye(year - 1), ye(year), ...(asOf > ye(year) ? [asOf] : [])].filter((d) => d >= inputs.opening.asOf);
  const bs: [string, BalanceSheet][] = bsDates.map((d) => [fmtDate(d), balanceSheetAt(inputs, d)]);
  const ratios = years.map((y) => financialRatios(ratioInputsFor(inputs, { from: ye(y - 1), to: ye(y), label: String(y) } as never, inputs.ownerLaborAnnualCents)));
  const health = healthScore(ratios[ratios.length - 1]!, inputs.loans.some((l) => !l.isLine));
  const loans = await prisma.liability.findMany({ where: { farmId: farm.id }, orderBy: [{ type: "asc" }, { name: "asc" }] });

  const isRows: [string, (x: IncomeStatement) => bigint, boolean?][] = [
    ["Revenue", (x) => x.revenueCents], ["Cost of Production", (x) => -x.copCents], ["Gross Profit", (x) => x.grossProfitCents, true],
    ["Overhead", (x) => -x.overheadCents], ["Depreciation", (x) => -x.depreciationCents], ["Interest", (x) => -x.interestCents],
    ["Net Income (Operating)", (x) => x.netIncomeOperatingCents, true], ["Inventory Change", (x) => x.inventoryChangeCents], ["Livestock Value Change", (x) => x.livestockChangeCents],
    ["Net Farm Income", (x) => x.netFarmIncomeCents, true],
  ];
  const bsRows: [string, (x: BalanceSheet) => bigint, boolean?][] = [
    ["Cash", (x) => x.cashCents], ["Receivables", (x) => x.arCents], ["Inventory & Growing Crops", (x) => x.cropInventoryCents + x.feedCents + x.growingCropsCents + x.suppliesCents + x.marketLivestockCents],
    ["Total Current Assets", (x) => x.totalCurrentAssetsCents, true], ["Breeding Livestock", (x) => x.breedingLivestockCents], ["Machinery, Vehicles & Buildings", (x) => x.machineryCents + x.vehiclesCents + x.buildingsCents],
    ["Land (Cost)", (x) => x.landCents], ["Total Assets", (x) => x.totalAssetsCents, true],
    ["Current Liabilities", (x) => x.totalCurrentLiabilitiesCents], ["Term Debt", (x) => x.landLoansCents + x.equipmentLoansCents + x.vehicleLoansCents + x.otherTermDebtCents],
    ["Total Liabilities", (x) => x.totalLiabilitiesCents, true], ["Owner Equity", (x) => x.totalEquityCents, true], ["Net Worth at Market", (x) => x.marketNetWorthCents, true],
  ];
  const ratioRows: [string, (r: (typeof ratios)[number]) => string][] = [
    ["Current Ratio", (r) => fmt(r.currentRatio, "ratio")], ["Working Capital / Revenue", (r) => fmt(r.workingCapitalToGrossRevenue, "pct")],
    ["Debt to Assets", (r) => fmt(r.debtToAsset, "pct")], ["Debt to Equity", (r) => fmt(r.debtToEquity, "ratio")],
    ["Return on Assets", (r) => fmt(r.returnOnAssetsCost, "pct")], ["Operating Margin", (r) => fmt(r.operatingProfitMargin, "pct")],
    ["Term Debt Coverage", (r) => fmt(r.termDebtCoverage, "ratio")], ["Asset Turnover", (r) => fmt(r.assetTurnover, "pct")],
  ];

  return (
    <>
      <Link href="/reports" className="no-print mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft size={15} /> Reports</Link>
      <PageHeader title="Lender Package" subtitle={`${farm.name}${farm.location ? ` · ${farm.location}` : ""} · ${fmtDate(asOf)}`} action={<PrintButton />} />
      <div className="space-y-6">
        <Card className="flex flex-wrap gap-x-10 gap-y-3 p-6 text-sm">
          <div><p className="text-xs uppercase tracking-wider text-muted">Health</p><p className="mt-1 font-serif text-2xl font-bold text-ink">{health.overall}/100 · {health.status}</p></div>
          <div><p className="text-xs uppercase tracking-wider text-muted">Repayment Margin {year}</p><p className="mt-1 font-serif text-2xl font-bold"><Money cents={ratios[ratios.length - 1]!.repaymentMarginCents} /></p></div>
          <div><p className="text-xs uppercase tracking-wider text-muted">Net Worth at Market</p><p className="mt-1 font-serif text-2xl font-bold"><Money cents={bs[bs.length - 1]![1].marketNetWorthCents} /></p></div>
        </Card>
        <Table minWidth={720}>
          <thead><tr><Th>Income Statement</Th>{is.map(([k]) => <Th key={k} right>{k}</Th>)}</tr></thead>
          <tbody>{isRows.map(([label, f, bold]) => <tr key={label} className="border-t border-border"><Td strong={bold}>{label}</Td>{is.map(([k, x]) => <Td key={k} right strong={bold}><Money cents={f(x)} /></Td>)}</tr>)}</tbody>
        </Table>
        <Table minWidth={720}>
          <thead><tr><Th>Balance Sheet</Th>{bs.map(([k]) => <Th key={k} right>{k}</Th>)}</tr></thead>
          <tbody>{bsRows.map(([label, f, bold]) => <tr key={label} className="border-t border-border"><Td strong={bold}>{label}</Td>{bs.map(([k, x]) => <Td key={k} right strong={bold}><Money cents={f(x)} /></Td>)}</tr>)}</tbody>
        </Table>
        <Table minWidth={560}>
          <thead><tr><Th>Ratios</Th>{years.map((y) => <Th key={y} right>{y}</Th>)}</tr></thead>
          <tbody>{ratioRows.map(([label, f]) => <tr key={label} className="border-t border-border"><Td>{label}</Td>{ratios.map((r, i) => <Td key={i} right>{f(r)}</Td>)}</tr>)}</tbody>
        </Table>
        <Table minWidth={900}>
          <thead><tr><Th>Debt Schedule</Th><Th>Lender</Th><Th>Collateral</Th><Th right>Rate</Th><Th right>Balance</Th><Th right>Payment</Th><Th>Maturity</Th></tr></thead>
          <tbody>
            {loans.map((l) => (
              <tr key={l.id} className="border-t border-border">
                <Td strong>{l.name}</Td><Td muted>{l.lender ?? "–"}</Td><Td muted className="max-w-[240px]">{l.collateral ?? "–"}</Td>
                <Td right>{Number(l.ratePct).toFixed(2)}%{l.rateType ? <span className="block text-xs text-muted">{l.rateType.split(" ")[0]}</span> : null}</Td>
                <Td right><Money cents={l.balanceCents} /></Td><Td right>{l.paymentCents ? <Money cents={l.paymentCents} /> : "Revolving"}</Td>
                <Td muted>{l.maturityAt ? fmtDate(l.maturityAt) : "–"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </>
  );
}
