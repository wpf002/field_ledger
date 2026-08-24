"use client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { login } from "./actions";
import { Sprout, ShieldCheck, Eye } from "lucide-react";

const DEMO_PASSWORD = "demo1234"; // public demo credential
const DEMO = [
  { email: "owner@acreflow.test", name: "Sam Rivera", role: "Owner", desc: "Full access — add, edit, and post transactions.", icon: ShieldCheck },
  { email: "viewer@acreflow.test", name: "Jordan Bell", role: "Viewer", desc: "Read-only — can view everything, but cannot change data.", icon: Eye },
];

export function LoginForm() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function signIn(e: string, pw: string, key: string) {
    setBusy(key); setError(null);
    const res = await login(e, pw); // redirects on success
    if (res?.error) { setError(res.error); setBusy(null); }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-card bg-primary text-white"><Sprout size={24} /></div>
          <h1 className="font-serif text-3xl font-bold text-primary">Acreflow</h1>
          <p className="mt-1 text-sm text-muted">Sign in to your farm</p>
        </div>
        <Card className="p-6">
          <p className="mb-4 text-xs uppercase tracking-wider text-muted">Choose a demo account</p>
          <div className="space-y-3">
            {DEMO.map((u) => (
              <button key={u.email} onClick={() => signIn(u.email, DEMO_PASSWORD, u.email)} disabled={!!busy} className="flex w-full items-center gap-3 rounded-btn border border-border p-4 text-left transition hover:bg-tag/30 disabled:opacity-50">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mint text-primary"><u.icon size={17} /></span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">{u.name} <span className="ml-1 rounded-pill bg-tag px-2 py-0.5 text-xs text-brown">{u.role}</span></p>
                  <p className="text-xs text-muted">{u.desc}</p>
                </div>
                {busy === u.email && <span className="text-xs text-muted">Signing in…</span>}
              </button>
            ))}
          </div>

          <div className="my-5 flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-border" /> or sign in with email <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={(e) => { e.preventDefault(); signIn(email, password, "form"); }} className="space-y-3">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="you@farm.com" autoComplete="username" required />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input" placeholder="Password" autoComplete="current-password" required />
            <button type="submit" disabled={!!busy} className="w-full rounded-btn bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-deep disabled:opacity-50">{busy === "form" ? "Signing in…" : "Sign in"}</button>
          </form>

          {error && <p className="mt-3 text-sm text-negative">{error}</p>}
          <p className="mt-4 text-center text-xs text-muted">Demo password is <span className="font-medium text-ink">demo1234</span>. Viewers cannot post or edit anything.</p>
        </Card>
      </div>
    </div>
  );
}
