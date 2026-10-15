import { BrandMark } from "@/components/ui/brand-mark";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { getCurrentFarm } from "@/lib/session";
import { AcceptInvite } from "./accept";

export const dynamic = "force-dynamic";
const ROLE: Record<string, string> = { ADMIN: "Admin", MEMBER: "Member", ACCOUNTANT: "Accountant", VIEWER: "Viewer" };

/** Join a farm from an invite link: new users set a name and password; existing users accept while signed in. */
export default async function InvitePage({ params }: { params: { token: string } }) {
  const r = await apiFetch(`/invites/${encodeURIComponent(params.token)}`).catch(() => null);
  const inv = r?.ok ? ((await r.json()) as { farm: string; email: string; role: string; hasAccount: boolean }) : null;
  const session = await getCurrentFarm().catch(() => null);
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <BrandMark size={44} className="mx-auto mb-3" />
          <h1 className="font-serif text-2xl font-bold text-primary">{inv ? `Join ${inv.farm}` : "Invite Expired"}</h1>
          {inv && <p className="mt-1 text-sm text-muted">{inv.email} · {ROLE[inv.role] ?? inv.role}</p>}
        </div>
        {inv && <Card className="p-6"><AcceptInvite token={params.token} email={inv.email} hasAccount={inv.hasAccount} signedInAs={session?.user.email ?? null} /></Card>}
      </div>
    </div>
  );
}
