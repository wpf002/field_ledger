import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { BrandMark } from "@/components/ui/brand-mark";
import { prisma, findClient, parseScope } from "@fl/db";
import { getCurrentFarm } from "@/lib/session";
import { decide } from "./actions";

export const dynamic = "force-dynamic";
type SP = Record<string, string | undefined>;

function Problem({ text }: { text: string }) {
  return <div className="flex min-h-screen items-center justify-center bg-bg px-4"><Card className="max-w-md p-6 text-center text-sm text-ink">{text}</Card></div>;
}

/** Consent screen for MCP connectors (claude.ai, ChatGPT): pick the farm and what the connector may do. */
export default async function AuthorizePage({ searchParams: q }: { searchParams: SP }) {
  if (q.error) return <Problem text="This connection request couldn't be completed. Start again from the app you were connecting." />;
  const s = await getCurrentFarm();
  if (!s) redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${new URLSearchParams(q as Record<string, string>).toString()}`)}`);
  if (q.response_type !== "code" || !q.client_id || !q.redirect_uri || !q.code_challenge || (q.code_challenge_method ?? "plain") !== "S256") {
    return <Problem text="Invalid request: a code response with a PKCE S256 challenge is required." />;
  }
  const client = await findClient(prisma, q.client_id, q.redirect_uri);
  if (!client) return <Problem text="This app isn't registered, or its return address doesn't match." />;
  const wantsAnalyze = parseScope(q.scope) === "analyze" || !q.scope;
  const host = new URL(q.redirect_uri).host;

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <BrandMark size={44} className="mx-auto mb-3" />
          <h1 className="font-serif text-2xl font-bold text-primary">Connect {client.name ?? "an app"}</h1>
          <p className="mt-1 text-sm text-muted">{host} wants to read your farm&rsquo;s numbers as {s.user.name ?? s.user.email}.</p>
        </div>
        <Card className="p-6">
          <form action={decide} className="space-y-4 text-sm">
            {(["client_id", "redirect_uri", "state", "code_challenge"] as const).map((k) => <input key={k} type="hidden" name={k} value={q[k] ?? ""} />)}
            <label className="block"><span className="text-muted">Farm</span>
              <select name="farm_id" defaultValue={s.farm.id} className="input mt-1 w-full">{s.memberships.map((m) => <option key={m.farmId} value={m.farmId}>{m.farm.name}</option>)}</select>
            </label>
            <fieldset className="space-y-2">
              <legend className="text-muted">Access</legend>
              <label className="flex items-start gap-2"><input type="radio" name="scope" value="read" defaultChecked={!wantsAnalyze} className="mt-1" /><span><span className="font-medium text-ink">Read</span><br /><span className="text-muted">Statements, cash, debt, inventory, receivables, health.</span></span></label>
              <label className="flex items-start gap-2"><input type="radio" name="scope" value="analyze" defaultChecked={wantsAnalyze} className="mt-1" /><span><span className="font-medium text-ink">Read + Analyze</span><br /><span className="text-muted">Also forecasts, scenarios, insights, and the brief. Viewers get Read.</span></span></label>
            </fieldset>
            <p className="text-xs text-muted">The app can&rsquo;t change your books or move money.</p>
            <div className="flex gap-2">
              <button name="decision" value="allow" className="flex-1 rounded-btn bg-primary px-4 py-2.5 font-medium text-white hover:bg-primary-deep">Allow</button>
              <button name="decision" value="deny" className="flex-1 rounded-btn border border-border px-4 py-2.5 text-ink hover:bg-tag/40">Deny</button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
