"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL ?? "/api";
type PlaidHandler = { open: () => void };
declare global { interface Window { Plaid?: { create: (o: { token: string; onSuccess: (publicToken: string, meta: { institution?: { name?: string } }) => void }) => PlaidHandler } } }

async function call(path: string, init?: RequestInit) {
  const r = await fetch(`${API}${path}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.message ?? `Request failed (${r.status})`);
  return body;
}
const loadPlaid = () => new Promise<void>((ok, fail) => {
  if (window.Plaid) return ok();
  const s = document.createElement("script");
  s.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js"; s.onload = () => ok(); s.onerror = () => fail(new Error("Couldn't load Plaid Link"));
  document.head.appendChild(s);
});

/** Connect / sync / remove buttons for one provider card. */
export function IntegrationActions({ farmId, provider, auth, connectionId, canConnect }: { farmId: string; provider: string; auth: string; connectionId?: string; canConnect: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [coords, setCoords] = useState({ lat: "", lon: "" });
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); setMsg(null); try { await fn(); router.refresh(); } catch (e) { setMsg(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); } };
  const btn = "rounded-btn px-3 py-1.5 text-sm disabled:opacity-50";

  if (connectionId) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {auth !== "public" && auth !== "webhook" && <button disabled={busy} className={`${btn} bg-primary text-white hover:bg-primary-deep`} onClick={() => run(async () => { const c = await call(`/farms/${farmId}/integrations/${connectionId}/sync`, { method: "POST" }); setMsg(`Synced: ${c.transactions ?? 0} transactions, ${c.invoices ?? 0} invoices, ${c.bills ?? 0} bills`); })}>Sync Now</button>}
        <button disabled={busy} className={`${btn} border border-border text-ink hover:bg-tag/40`} onClick={() => run(() => call(`/farms/${farmId}/integrations/${connectionId}`, { method: "DELETE", headers: {} }))}>Disconnect</button>
        {msg && <span className="text-xs text-muted">{msg}</span>}
      </div>
    );
  }
  if (!canConnect) return null;
  if (auth === "public") {
    return (
      <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); run(() => call(`/farms/${farmId}/integrations/nws`, { method: "POST", body: JSON.stringify({ lat: Number(coords.lat), lon: Number(coords.lon) }) })); }}>
        <input value={coords.lat} onChange={(e) => setCoords({ ...coords, lat: e.target.value })} placeholder="Latitude" className="input w-28" inputMode="decimal" />
        <input value={coords.lon} onChange={(e) => setCoords({ ...coords, lon: e.target.value })} placeholder="Longitude" className="input w-28" inputMode="decimal" />
        <button disabled={busy} className={`${btn} bg-primary text-white`}>Save</button>
        {msg && <span className="text-xs text-negative">{msg}</span>}
      </form>
    );
  }
  const connect = () => run(async () => {
    if (auth === "plaid_link") {
      const { linkToken } = await call(`/farms/${farmId}/integrations/plaid/link-token`, { method: "POST", body: "{}" });
      await loadPlaid();
      window.Plaid!.create({ token: linkToken, onSuccess: (publicToken, meta) => run(() => call(`/farms/${farmId}/integrations/plaid/exchange`, { method: "POST", body: JSON.stringify({ publicToken, institution: meta.institution?.name }) })) }).open();
    } else if (auth === "webhook") {
      const { url } = await call(`/farms/${farmId}/integrations/webhook`, { method: "POST", body: "{}" });
      setMsg(`Webhook URL: ${url}`);
    } else {
      const { url } = await call(`/farms/${farmId}/integrations/${provider}/connect`);
      window.location.href = url;
    }
  });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button disabled={busy} onClick={connect} className={`${btn} bg-primary text-white hover:bg-primary-deep`}>Connect</button>
      {msg && <span className="break-all text-xs text-muted">{msg}</span>}
    </div>
  );
}
