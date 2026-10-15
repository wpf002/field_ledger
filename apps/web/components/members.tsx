"use client";
import { useEffect, useState } from "react";
import { Trash2, Copy } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "/api";
const ROLES = [["ADMIN", "Admin"], ["MEMBER", "Member"], ["ACCOUNTANT", "Accountant"], ["VIEWER", "Viewer"]] as const;
const LABEL: Record<string, string> = { OWNER: "Owner", ADMIN: "Admin", MEMBER: "Member", ACCOUNTANT: "Accountant", VIEWER: "Viewer" };
type Data = { members: { userId: string; name: string | null; email: string; role: string }[]; invites: { id: string; email: string; role: string; expiresAt: string }[] };

/** Users with access to this farm, pending invites, and an invite form. */
export function Members({ farmId, canManage, canInvite }: { farmId: string; canManage: boolean; canInvite: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("MEMBER");
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => fetch(`${API}/farms/${farmId}/members`).then((r) => (r.ok ? r.json() : null)).then(setData);
  useEffect(() => { load(); }, [farmId]); // eslint-disable-line react-hooks/exhaustive-deps
  async function call(path: string, method: string, body?: object) {
    setError(null);
    const r = await fetch(`${API}/farms/${farmId}/${path}`, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
    const j = r.status === 204 ? {} : await r.json().catch(() => ({}));
    if (!r.ok) { setError(j.message ?? "Failed"); return null; }
    load();
    return j;
  }
  return (
    <div className="space-y-4 text-sm">
      <ul className="divide-y divide-border">
        {data?.members.map((m) => (
          <li key={m.userId} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
            <div><p className="font-medium text-ink">{m.name ?? m.email}</p><p className="text-xs text-muted">{m.email}</p></div>
            {canManage && m.role !== "OWNER" ? (
              <span className="flex items-center gap-3">
                <select value={m.role} onChange={(e) => call(`members/${m.userId}`, "PUT", { role: e.target.value })} className="rounded-btn border border-border bg-surface px-2 py-1 text-sm">
                  {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <button onClick={() => confirm(`Remove ${m.email}?`) && call(`members/${m.userId}`, "DELETE")} className="text-muted hover:text-negative" title="Remove"><Trash2 size={15} /></button>
              </span>
            ) : <span className="text-muted">{LABEL[m.role] ?? m.role}</span>}
          </li>
        ))}
        {data?.invites.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-3 py-2.5 text-muted">
            <span>{i.email} · {LABEL[i.role]} · Invited</span>
            {canManage && <button onClick={() => call(`invites/${i.id}`, "DELETE")} className="hover:text-negative" title="Cancel Invite"><Trash2 size={15} /></button>}
          </li>
        ))}
      </ul>
      {canManage && (canInvite ? (
        <form className="flex flex-wrap gap-2" onSubmit={async (e) => { e.preventDefault(); const j = await call("invites", "POST", { email, role }); if (j?.url) { setLink(j.url); setEmail(""); } }}>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="input min-w-[200px] flex-1" />
          <select value={role} onChange={(e) => setRole(e.target.value)} className="input w-40">{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <button className="rounded-btn bg-primary px-4 py-2 font-medium text-white hover:bg-primary-deep">Invite</button>
        </form>
      ) : <a href="#plan" className="text-primary underline">More users are on Business</a>)}
      {link && (
        <div className="flex items-center gap-2 rounded-btn bg-cream-tint px-3 py-2">
          <span className="truncate text-xs text-ink" title={link}>{link}</span>
          <button onClick={() => navigator.clipboard?.writeText(link)} className="shrink-0 text-muted hover:text-ink" title="Copy Link"><Copy size={14} /></button>
        </div>
      )}
      {error && <p className="text-negative">{error}</p>}
    </div>
  );
}
