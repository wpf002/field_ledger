import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, SectionHeading } from "@/components/ui/card";
import { getDemoFarm, getCurrentRole } from "@/lib/data";
import { prisma } from "@fl/db";
import { getCurrentFarm } from "@/lib/session";
import { ApiTokens } from "@/components/api-tokens";
import { PlanPicker } from "@/components/plan-picker";
import { Members } from "@/components/members";
import { saveEntityGroup } from "./actions";
import { headers } from "next/headers";
import { asPlan, hasFeature, PLAN_NAME, PLAN_SUMMARY, type Plan } from "@fl/core";
import { Download, Building2, UserCircle2, FileText, KeyRound, CreditCard, Users, Lock } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "/api";

export default async function AccountPage({ searchParams }: { searchParams: { billing?: string } }) {
  const farm = await getDemoFarm();
  const current = await getCurrentFarm();
  const role = await getCurrentRole();
  const plan = asPlan(farm.plan);
  const owner = role === "OWNER" || role === "ADMIN";
  const tokens = current ? await prisma.apiToken.findMany({ where: { userId: current.user.id, farmId: farm.id, revokedAt: null }, orderBy: { createdAt: "desc" } }) : [];
  const h = headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;
  const plans = (["essentials", "pro", "business"] as Plan[]).map((k) => ({ key: k, name: PLAN_NAME[k], items: PLAN_SUMMARY[k] }));
  return (
    <>
      <PageHeader title="Account" />
      {searchParams.billing === "success" && <p className="mb-4 rounded-btn bg-mint px-4 py-2 text-sm text-primary">Subscription updated.</p>}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <SectionHeading icon={<Building2 size={18} className="text-primary" />} title="Farm" />
          <p className="mt-4 font-medium text-ink">{farm.name}</p>
          {owner && hasFeature(plan, "consolidated") && (
            <form action={saveEntityGroup} className="mt-4 flex gap-2 text-sm">
              <input name="entityGroup" defaultValue={farm.entityGroup ?? ""} placeholder="Entity Group" aria-label="Entity Group" title="Farms with the same group report together on Consolidated" className="input flex-1" />
              <button className="rounded-btn border border-border px-4 py-2 text-ink hover:bg-tag/40">Save</button>
            </form>
          )}
        </Card>
        <Card className="p-6">
          <SectionHeading icon={<UserCircle2 size={18} className="text-primary" />} title="Profile" />
          <p className="mt-4 font-medium text-ink">{current?.user.name ?? current?.user.email}</p>
          <p className="text-sm text-muted">{current?.user.email}</p>
        </Card>
        <Card className="p-6 lg:col-span-2">
          <div id="plan" className="scroll-mt-6" />
          <SectionHeading icon={<CreditCard size={18} className="text-primary" />} title="Plan" />
          <div className="mt-4"><PlanPicker farmId={farm.id} plan={plan} plans={plans} canChange={owner} hasCustomer={!!farm.stripeCustomerId} /></div>
        </Card>
        <Card className="p-6">
          <SectionHeading icon={<Users size={18} className="text-primary" />} title="Users" />
          <div className="mt-4"><Members farmId={farm.id} canManage={owner} canInvite={hasFeature(plan, "multiple_users")} /></div>
        </Card>
        <Card className="p-6">
          <SectionHeading icon={<Download size={18} className="text-primary" />} title="Data Export" />
          <div className="mt-4 flex flex-wrap gap-2">
            <a href={`${API}/farms/${farm.id}/export/transactions.csv`} className="rounded-btn border border-border px-4 py-2.5 text-sm text-ink hover:bg-tag/40">Transactions CSV</a>
            <a href={`${API}/farms/${farm.id}/export.json`} className="rounded-btn border border-border px-4 py-2.5 text-sm text-ink hover:bg-tag/40">Full Backup (JSON)</a>
            <Link href="/reports" className="inline-flex items-center gap-2 rounded-btn border border-border px-4 py-2.5 text-sm text-ink hover:bg-tag/40"><FileText size={15} /> Reports</Link>
          </div>
        </Card>
        <Card className="p-6 lg:col-span-2">
          <SectionHeading icon={<KeyRound size={18} className="text-primary" />} title="API & AI Connectors" />
          <div className="mt-4">
            {hasFeature(plan, "api_access") ? (
              <ApiTokens rows={tokens.map((t) => ({ id: t.id, name: t.name, prefix: t.prefix, scope: t.scope, lastUsedAt: t.lastUsedAt?.toISOString() ?? null, createdAt: t.createdAt.toISOString() }))}
                mcpUrl={`${origin}/api/mcp`} apiUrl={`${origin}/api/v1`} canAnalyze={role !== "VIEWER"} />
            ) : <a href="#plan" className="inline-flex items-center gap-2 text-sm text-primary underline"><Lock size={14} /> API and MCP are on Business</a>}
          </div>
        </Card>
      </div>
    </>
  );
}
