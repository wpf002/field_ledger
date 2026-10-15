"use client";
import { useState } from "react";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_URL ?? "/api";

export function AcceptInvite({ token, email, hasAccount, signedInAs }: { token: string; email: string; hasAccount: boolean; signedInAs: string | null }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const accept = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null); setBusy(true);
    const r = await fetch(`${API}/invites/${encodeURIComponent(token)}/accept`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(hasAccount ? {} : { name, password }) });
    setBusy(false);
    if (!r.ok) { setError((await r.json().catch(() => null))?.message ?? "Couldn't accept"); return; }
    window.location.href = hasAccount ? "/" : `/login?email=${encodeURIComponent(email)}`;
  };
  if (hasAccount) {
    return signedInAs?.toLowerCase() === email.toLowerCase()
      ? <><button onClick={() => accept()} disabled={busy} className="w-full rounded-btn bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-deep">Accept</button>{error && <p className="mt-3 text-sm text-negative">{error}</p>}</>
      : <Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`} className="block w-full rounded-btn bg-primary px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-primary-deep">Sign In to Accept</Link>;
  }
  return (
    <form onSubmit={accept} className="space-y-3 text-sm">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your Name" required className="input w-full" />
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (8+ characters)" minLength={8} required className="input w-full" />
      <button disabled={busy} className="w-full rounded-btn bg-primary px-4 py-2.5 font-medium text-white hover:bg-primary-deep disabled:opacity-50">{busy ? "Joining…" : "Join Farm"}</button>
      {error && <p className="text-negative">{error}</p>}
    </form>
  );
}
