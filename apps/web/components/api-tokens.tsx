"use client";
import { useState, useTransition } from "react";
import { createToken, revokeToken } from "@/app/account/actions";

type Row = { id: string; name: string; prefix: string; scope: string; lastUsedAt: string | null; createdAt: string };

/** Personal tokens for the public API and the remote MCP server. */
export function ApiTokens({ rows, mcpUrl, apiUrl, canAnalyze }: { rows: Row[]; mcpUrl: string; apiUrl: string; canAnalyze: boolean }) {
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"read" | "analyze">("read");
  const [token, setToken] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4 text-sm">
      <dl className="grid gap-2 sm:grid-cols-2">
        <div><dt className="text-xs uppercase tracking-wider text-muted">MCP Server</dt><dd className="break-all font-mono text-xs text-ink">{mcpUrl}</dd></div>
        <div><dt className="text-xs uppercase tracking-wider text-muted">API</dt><dd className="break-all font-mono text-xs text-ink">{apiUrl}</dd></div>
      </dl>
      <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await createToken(name, scope); if ("token" in r && r.token) setToken(r.token); setName(""); }); }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Token name" className="input w-48" />
        <select value={scope} onChange={(e) => setScope(e.target.value as "read" | "analyze")} className="input">
          <option value="read">Read</option>
          {canAnalyze && <option value="analyze">Read + Analyze</option>}
        </select>
        <button disabled={pending} className="rounded-btn bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-deep disabled:opacity-50">Create Token</button>
      </form>
      {token && (
        <div className="rounded-btn bg-[#F6EAC6] p-3">
          <p className="text-xs text-ink">Copy this now. It won't be shown again.</p>
          <p className="mt-1 break-all font-mono text-xs text-ink">{token}</p>
        </div>
      )}
      <table className="w-full text-sm">
        <thead><tr className="text-left text-xs uppercase tracking-wider text-muted"><th className="py-1.5">Name</th><th>Token</th><th>Scope</th><th>Last Used</th><th /></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border">
              <td className="py-2 text-ink">{r.name}</td><td className="font-mono text-xs text-muted">{r.prefix}…</td><td className="text-muted">{r.scope === "analyze" ? "Read + Analyze" : "Read"}</td>
              <td className="text-muted">{r.lastUsedAt ? new Date(r.lastUsedAt).toLocaleDateString() : "Never"}</td>
              <td className="text-right"><button onClick={() => start(() => revokeToken(r.id))} className="text-xs text-muted hover:text-negative">Revoke</button></td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={5} className="py-3 text-center text-muted">No Tokens</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
