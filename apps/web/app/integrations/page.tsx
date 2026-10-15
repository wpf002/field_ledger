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

type Provider = { key: string; name: string; category: string; phase: number; auth: string; pulls: string; docs: string; env: string[]; configured: boolean; fields?: { key: string; label: string; secret?: boolean; placeholder?: string }[] };
const ORDER = ["Accounting", "Banking", "Payments", "Farm Software", "Livestock", "Crops", "Market Data", "Weather", "Equipment", "AI"];

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
      <Card className="divide-y divide-border overflow-hidden">
        {groups.map((g) => (
          <section key={g.cat}>
            <h3 className="bg-surface-sunken/60 px-5 py-2 text-xs font-medium uppercase tracking-wider text-muted">{g.cat}</h3>
            <div className="divide-y divide-border">
              {g.items.map((p) => {
                const conns = connections.filter((c) => c.provider === p.key);
                const ready = p.configured && ["oauth2", "plaid_link", "connect_url", "credentials", "server_key"].includes(p.auth);
                // Perplexity has nothing to connect per farm: the assistant uses it once the key is set.
                const status = p.key === "perplexity" ? (p.configured ? "On" : "Needs Credentials") : conns.length ? (conns.some((c) => c.status === "error") ? "Error" : "Connected")
                  : p.auth === "partner" ? "Partner Access" : p.auth === "file" ? "File Import" : (p.auth === "public" || p.auth === "webhook" || ready) ? "Available" : "Needs Credentials";
                const tip = status === "Needs Credentials" ? `Set ${p.env.join(" and ")} on the server` : undefined;
                return (
                  <div key={p.key} className="px-5 py-4">
                    <div className="grid items-center gap-3 md:grid-cols-[minmax(0,1fr)_9rem_22rem]">
                      <div className="min-w-0">
                        <h4 className="font-serif text-base font-semibold text-ink">{p.name}</h4>
                        <p className="truncate text-sm text-muted" title={p.pulls}>{p.pulls}</p>
                      </div>
                      <span title={tip} className={clsx("w-fit rounded-pill px-2.5 py-0.5 text-xs font-medium", status === "Connected" || status === "On" ? "bg-mint text-positive" : status === "Error" ? "bg-[#F3E3E0] text-negative" : status === "Available" ? "bg-[#F6EAC6] text-ink" : "bg-surface-sunken text-muted")}>{status}</span>
                      <div className="min-w-0 md:flex md:justify-end">
                        {!conns.length && status === "File Import" && <Link href={p.docs} className="text-sm text-primary underline">Import CSV</Link>}
                        {!conns.length && status === "Partner Access" && <a href={p.docs} target="_blank" rel="noreferrer" className="text-sm text-muted underline">Partner Program</a>}
                        {!conns.length && status === "Available" && <IntegrationActions farmId={farmId} provider={p.key} auth={p.auth} fields={p.fields} canConnect={editable} />}
                      </div>
                    </div>
                    {conns.map((c) => (
                      <div key={c.id} className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-btn bg-surface-sunken px-3 py-2 text-xs text-muted">
                        <span>{c.label ?? c.externalAccountId ?? "Account"} · {c.lastSyncAt ? `Synced ${fmtDate(c.lastSyncAt)}` : "Not synced"}{c.lastError && <span className="text-negative"> · {c.lastError.slice(0, 120)}</span>}</span>
                        <span className="flex flex-wrap items-center gap-2">
                          {p.auth === "connect_url" && <IntegrationActions farmId={farmId} provider={p.key} auth={p.auth} canConnect={editable} />}
                          <IntegrationActions farmId={farmId} provider={p.key} auth={p.auth} connectionId={c.id} canConnect={editable} />
                        </span>
                      </div>
                    ))}
                    {p.key === "nws" && weather && (
                      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                        {weather.periods.slice(0, 6).map((w) => (
                          <div key={w.name} className="rounded-btn bg-surface-sunken px-2 py-1.5 text-xs">
                            <p className="font-medium text-ink">{w.name}</p>
                            <p className="text-muted">{w.temp} · {w.rainChance ?? 0}% rain</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </Card>
    </>
  );
}
