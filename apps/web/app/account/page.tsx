import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, SectionHeading } from "@/components/ui/card";
import { getDemoFarm } from "@/lib/data";
import { Download, Building2, UserCircle2, FileText } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default async function AccountPage() {
  const farm = await getDemoFarm();
  return (
    <>
      <PageHeader title="My Account" subtitle="Profile, farm, and preferences." />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Card className="p-6">
          <SectionHeading icon={<Building2 size={18} className="text-primary" />} title="Farm" />
          <div className="mt-4 space-y-1 text-sm">
            <p className="text-muted">Farm name</p>
            <p className="font-medium text-ink">{farm.name}</p>
          </div>
        </Card>
        <Card className="p-6">
          <SectionHeading icon={<UserCircle2 size={18} className="text-primary" />} title="Profile" />
          <div className="mt-4 space-y-1 text-sm">
            <p className="text-muted">Signed in as</p>
            <p className="font-medium text-ink">Demo Owner</p>
          </div>
        </Card>
        <Card className="col-span-2 p-6">
          <SectionHeading icon={<Download size={18} className="text-primary" />} title="Data Backup & Export" />
          <p className="mt-2 text-sm text-muted">Download a full copy of your ledger, inventory, and obligations. Your data is yours (Invariant 7).</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a href={`${API}/farms/${farm.id}/export/transactions.csv`} className="rounded-btn border border-border px-4 py-2.5 text-sm text-ink hover:bg-tag/40">Transactions CSV</a>
            <a href={`${API}/farms/${farm.id}/export.json`} className="rounded-btn border border-border px-4 py-2.5 text-sm text-ink hover:bg-tag/40">Full backup (JSON)</a>
            <Link href="/reports" className="inline-flex items-center gap-2 rounded-btn border border-border px-4 py-2.5 text-sm text-ink hover:bg-tag/40"><FileText size={15} /> Reports &amp; tax exports</Link>
          </div>
        </Card>
      </div>
    </>
  );
}
