"use client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { login } from "./actions";
import { Sprout, ShieldCheck, Eye } from "lucide-react";

const DEMO = [
  { email: "owner@fieldandledger.test", name: "Sam Rivera", role: "Owner", desc: "Full access — add, edit, and post transactions.", icon: ShieldCheck },
  { email: "viewer@fieldandledger.test", name: "Jordan Bell", role: "Viewer", desc: "Read-only — can view everything, but cannot change data.", icon: Eye },
];

export default function LoginPage() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signIn(email: string) {
    setBusy(email); setError(null);
    const res = await login(email); // redirects on success
    if (res?.error) { setError(res.error); setBusy(null); }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-card bg-primary text-white"><Sprout size={24} /></div>
          <h1 className="font-serif text-3xl font-bold text-primary">Field &amp; Ledger</h1>
          <p className="mt-1 text-sm text-muted">Sign in to your farm</p>
        </div>
        <Card className="p-6">
          <p className="mb-4 text-xs uppercase tracking-wider text-muted">Choose a demo account</p>
          <div className="space-y-3">
            {DEMO.map((u) => (
              <button key={u.email} onClick={() => signIn(u.email)} disabled={!!busy} className="flex w-full items-center gap-3 rounded-btn border border-border p-4 text-left transition hover:bg-tag/30 disabled:opacity-50">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mint text-primary"><u.icon size={17} /></span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">{u.name} <span className="ml-1 rounded-pill bg-tag px-2 py-0.5 text-xs text-brown">{u.role}</span></p>
                  <p className="text-xs text-muted">{u.desc}</p>
                </div>
                {busy === u.email && <span className="text-xs text-muted">Signing in…</span>}
              </button>
            ))}
          </div>
          {error && <p className="mt-3 text-sm text-negative">{error}</p>}
          <p className="mt-4 text-center text-xs text-muted">Roles restrict access: the Viewer cannot post or edit anything.</p>
        </Card>
      </div>
    </div>
  );
}
