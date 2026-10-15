import Link from "next/link";
import clsx from "clsx";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { IntegrationActions } from "@/components/integration-actions";
import { prisma } from "@fl/db";
import { getDemoFarmId, getCurrentRole, canWrite } from "@/lib/data";
import { fmtDate } from "@/lib/format";
import { apiFetch } from "@/lib/api";

export const dynamic = "force-dynamic";

type Provider = { key: string; name: string; category: string; phase: number; auth: string; pulls: string; docs: string; env: string[]; configured: boolean };
const ORDER = ["Accounting", "Banking", "Payments", "Farm Software", "Livestock", "Crops", "Market Data", "Weather", "Equipment"];

export default async function IntegrationsPage({ searchParams }: { searchParams: { connected?: string; error?: string } }) {
  const farmId = await getDemoFarmId();
  const editable = canWrite(await getCurrentRole());
  const [providers, connections] = await Promise.all([
    apiFetch("/integrations/providers").then((r) => r.json() as Promise<Provider[]>).catch(() => [] as Provider[]),
    prisma.connection.findMany({ where: { farmId }, include: { syncRuns: { orderBy: { startedAt: "desc" }, take: 1 } } }),
  ]);
  // Forecast for the weather card when the farm's coordinates are set.
  const weather = connections.some((c) => c.provider === "nws")
    ? await apiFetch(`/farms/${farmId}/weather/forecast`).then((r) => (r.ok ? (r.json() as Promise<{ periods: { name: string; temp: string; rainChance: number | null; summary: string }[] }>) : null)).catch(() => null)
    : null;
  const groups = ORDER.map((cat) => ({ cat, items: providers.filter((p) => p.category === cat) })).filter((g) => g.items.length);

  return (
    <>
      <PageHeader title="Integrations" />
      {searchParams.connected && <p className="mb-4 rounded-btn bg-mint px-4 py-2 text-sm text-primary">Connected. The first sync is running.</p>}
      {searchParams.error && <p className="mb-4 rounded-btn bg-[#F3E3E0] px-4 py-2 text-sm text-negative">Connection failed ({searchParams.error}).</p>}
      <div className="space-y-8">
        {groups.map((g) => (
          <section key={g.cat}>
            <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted">{g.cat}</h3>
            <div className="grid gap-4 lg:grid-cols-2">
              {g.items.map((p) => {
                const conns = connections.filter((c) => c.provider === p.key);
                const ready = p.configured && ["oauth2", "plaid_link", "server_key"].includes(p.auth);
                const status = conns.length ? (conns.some((c) => c.status === "error") ? "Error" : "Connected")
                  : p.auth === "partner" ? "Partner Access" : p.auth === "file" ? "File Import" : (p.auth === "public" || p.auth === "webhook" || ready) ? "Available" : "Needs Credentials";
                return (
                  <Card key={p.key} className="flex flex-col gap-3 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div><h4 className="font-serif text-lg font-semibold text-ink">{p.name}</h4><p className="text-sm text-muted">{p.pulls}</p></div>
                      <span className={clsx("shrink-0 rounded-pill px-2.5 py-0.5 text-xs font-medium", status === "Connected" ? "bg-mint text-positive" : status === "Error" ? "bg-[#F3E3E0] text-negative" : status === "Available" ? "bg-[#F6EAC6] text-ink" : "bg-surface-sunken text-muted")}>{status}</span>
                    </div>
                    {conns.map((c) => (
                      <div key={c.id} className="rounded-btn bg-surface-sunken px-3 py-2 text-xs text-muted">
                        {c.label ?? c.externalAccountId ?? "Account"} · {c.lastSyncAt ? `last sync ${fmtDate(c.lastSyncAt)}` : "not synced yet"}{c.lastError && <span className="text-negative"> · {c.lastError.slice(0, 120)}</span>}
                        <div className="mt-2"><IntegrationActions farmId={farmId} provider={p.key} auth={p.auth} connectionId={c.id} canConnect={editable} /></div>
                      </div>
                    ))}
                    {p.key === "nws" && weather && (
                      <div className="grid grid-cols-3 gap-2">
                        {weather.periods.slice(0, 6).map((w) => (
                          <div key={w.name} className="rounded-btn bg-surface-sunken px-2 py-1.5 text-xs">
                            <p className="font-medium text-ink">{w.name}</p>
                            <p className="text-muted">{w.temp} · {w.rainChance ?? 0}% rain</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {!conns.length && status === "Needs Credentials" && <p className="text-xs text-muted">Turns on when {p.env.join(" and ")} {p.env.length > 1 ? "are" : "is"} set on the server.</p>}
                    {!conns.length && status === "File Import" && <Link href={p.docs} className="text-sm text-primary underline">Import a CSV export</Link>}
                    {!conns.length && status === "Partner Access" && <a href={p.docs} target="_blank" rel="noreferrer" className="text-xs text-muted underline">Partner program</a>}
                    {!conns.length && status === "Available" && <IntegrationActions farmId={farmId} provider={p.key} auth={p.auth} canConnect={editable} />}
                  </Card>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
