"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import clsx from "clsx";
import { Sparkles, PencilLine, Camera, Send, Upload, CheckCircle2, ShieldCheck } from "lucide-react";
import { enqueue } from "@/lib/outbox";

const API = process.env.NEXT_PUBLIC_API_URL ?? "/api";
type Tab = "chat" | "quicklog" | "receipt";
type Account = { code: string; label: string; kind: "INCOME" | "EXPENSE" };
type Draft = { date: string; description: string; amountCents: string; kind: "INCOME" | "EXPENSE"; accountCode: string; accountLabel: string };
type ChatMsg = { role: "user" | "assistant"; text: string };

const SUGGESTIONS = [
  "Analyze my current cashflow situation",
  "What inventory is ready for market?",
  "Review my upcoming expenses and liabilities",
  "Am I over budget on anything?",
  "What's my Schedule F profit this year?",
];
const TABS: { value: Tab; label: string; icon: typeof Sparkles }[] = [
  { value: "chat", label: "Chat", icon: Sparkles },
  { value: "quicklog", label: "Quick Log", icon: PencilLine },
  { value: "receipt", label: "Receipt Capture", icon: Camera },
];

export function AssistantView({ farmId }: { farmId: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("chat");
  const [mode, setMode] = useState<"claude" | "deterministic" | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);

  // chat
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // quick log + receipt drafts
  const [logText, setLogText] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [posted, setPosted] = useState<string | null>(null);
  const [receiptNote, setReceiptNote] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/assistant/status`).then((r) => r.json()).then((s) => setMode(s.mode)).catch(() => {});
    fetch(`${API}/farms/${farmId}/accounts`).then((r) => r.json()).then(setAccounts).catch(() => {});
  }, [farmId]);
  useEffect(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight); }, [messages]);

  async function ask(message: string) {
    if (!message.trim()) return;
    setMessages((m) => [...m, { role: "user", text: message }]);
    setInput(""); setChatBusy(true);
    try {
      const res = await fetch(`${API}/farms/${farmId}/assistant/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message }) });
      const data = await res.json();
      setMessages((m) => [...m, { role: "assistant", text: data.answer ?? "Sorry, I couldn't answer that." }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "The assistant is unavailable right now." }]);
    } finally {
      setChatBusy(false);
    }
  }

  async function parseQuickLog() {
    setBusy(true); setDraft(null); setDraftError(null); setPosted(null); setReceiptNote(null);
    try {
      const res = await fetch(`${API}/farms/${farmId}/assistant/quick-log`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: logText }) });
      const data = await res.json();
      if (data.error) setDraftError(data.error); else setDraft(data.draft);
    } finally { setBusy(false); }
  }

  async function onReceipt(file: File) {
    setBusy(true); setDraft(null); setDraftError(null); setPosted(null); setReceiptNote(null);
    try {
      const b64 = await new Promise<string>((resolve) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(",")[1] ?? ""); r.readAsDataURL(file); });
      const res = await fetch(`${API}/farms/${farmId}/assistant/receipt`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ imageBase64: b64, mediaType: file.type, filename: file.name }) });
      const data = await res.json();
      setDraft(data.draft); setReceiptNote(data.note ?? null);
    } finally { setBusy(false); }
  }

  async function confirmPost() {
    if (!draft) return;
    setBusy(true); setDraftError(null);
    const body = { date: draft.date, description: draft.description, accountCode: draft.accountCode, amountCents: draft.amountCents };
    // Field use: if there's no signal, don't lose the entry — queue it locally
    // and let the sync layer replay it on reconnect. Money stays integer cents.
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      await enqueue({ farmId, body, createdAt: Date.now() });
      setPosted("Saved offline — will sync when you're back online."); setDraft(null); setLogText(""); setBusy(false);
      return;
    }
    try {
      const res = await fetch(`${API}/farms/${farmId}/transactions`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { setDraftError((await res.json().catch(() => null))?.message ?? "Post failed"); return; }
      setPosted("Posted to your ledger."); setDraft(null); setLogText(""); router.refresh();
    } catch {
      // Network dropped between the online check and the request — queue it.
      await enqueue({ farmId, body, createdAt: Date.now() });
      setPosted("Saved offline — will sync when you're back online."); setDraft(null); setLogText("");
    } finally { setBusy(false); }
  }

  const updateDraft = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex flex-wrap gap-2">
          {TABS.map(({ value, label, icon: Icon }) => (
            <button key={value} onClick={() => { setTab(value); setDraft(null); setPosted(null); setDraftError(null); }} className={clsx("flex items-center gap-2 rounded-pill px-4 py-2 text-sm transition", tab === value ? "bg-surface text-ink shadow-card" : "text-muted hover:bg-tag/40")}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
        {mode && (
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-mint px-3 py-1 text-xs text-primary">
            <ShieldCheck size={13} /> Grounded in your ledger · {mode === "claude" ? "Claude" : "rule-based"}
          </span>
        )}
      </div>

      {tab === "chat" && (
        <Card className="flex min-h-[460px] flex-col p-6">
          {messages.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mint text-primary"><Sparkles size={22} /></span>
              <h3 className="mt-4 font-serif text-2xl font-semibold text-ink">Welcome to your AI Ranch Hand</h3>
              <p className="mt-1 max-w-md text-sm text-muted">Ask about your operation — every figure I give comes straight from your ledger.</p>
              <div className="mt-6 w-full max-w-xl space-y-2">
                {SUGGESTIONS.map((s) => <button key={s} onClick={() => ask(s)} className="w-full rounded-btn border border-border px-4 py-3 text-left text-sm text-ink hover:bg-tag/30">{s}</button>)}
              </div>
            </div>
          ) : (
            <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto">
              {messages.map((m, i) => (
                <div key={i} className={clsx("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                  <div className={clsx("max-w-[80%] whitespace-pre-wrap rounded-card px-4 py-2.5 text-sm", m.role === "user" ? "bg-primary text-white" : "bg-surface-sunken text-ink")}>{m.text}</div>
                </div>
              ))}
              {chatBusy && <p className="text-sm text-muted">Flint is checking your ledger…</p>}
            </div>
          )}
          <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="mt-6 flex items-center gap-2 rounded-btn border border-border px-4 py-2">
            <input value={input} onChange={(e) => setInput(e.target.value)} className="w-full bg-transparent text-sm outline-none placeholder:text-muted" placeholder="Ask about your farm operations..." />
            <button type="submit" disabled={chatBusy} className="rounded-btn bg-primary p-2 text-white hover:bg-primary-deep disabled:opacity-50"><Send size={15} /></button>
          </form>
        </Card>
      )}

      {tab === "quicklog" && (
        <Card className="p-6">
          <h3 className="font-serif text-xl font-semibold text-ink">Quick Log</h3>
          <p className="mt-1 text-sm text-muted">Describe a transaction in plain English. I&rsquo;ll draft it — nothing posts until you confirm.</p>
          <textarea rows={3} value={logText} onChange={(e) => setLogText(e.target.value)} className="mt-4 w-full rounded-btn border border-border p-3 text-sm outline-none placeholder:text-muted" placeholder="e.g. Sold 5 head of cattle at auction for $6,730.65" />
          <div className="mt-3 flex justify-end">
            <button onClick={parseQuickLog} disabled={busy || !logText.trim()} className="rounded-btn bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-deep disabled:opacity-50">{busy ? "Drafting…" : "Draft Transaction"}</button>
          </div>
          {draftError && <p className="mt-3 text-sm text-negative">{draftError}</p>}
          {posted && <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-positive"><CheckCircle2 size={15} /> {posted}</p>}
          {draft && <DraftCard draft={draft} accounts={accounts} onChange={updateDraft} onConfirm={confirmPost} onCancel={() => setDraft(null)} busy={busy} />}
        </Card>
      )}

      {tab === "receipt" && (
        <Card className="p-6">
          <h3 className="font-serif text-xl font-semibold text-ink">Receipt Capture</h3>
          <p className="mt-1 text-sm text-muted">Upload a receipt photo. {mode === "claude" ? "I'll parse it into a draft for your review." : "I'll create a draft for you to fill in (vision auto-fill needs an Anthropic key)."}</p>
          <label className="mt-4 flex cursor-pointer flex-col items-center gap-2 rounded-card border-2 border-dashed border-border py-12 text-center hover:bg-tag/20">
            <Upload size={26} className="text-muted" />
            <span className="text-sm text-muted">{busy ? "Reading receipt…" : "Click to upload a receipt image"}</span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onReceipt(e.target.files[0])} />
          </label>
          {receiptNote && <p className="mt-3 text-sm text-muted">{receiptNote}</p>}
          {posted && <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-positive"><CheckCircle2 size={15} /> {posted}</p>}
          {draft && <DraftCard draft={draft} accounts={accounts} onChange={updateDraft} onConfirm={confirmPost} onCancel={() => setDraft(null)} busy={busy} />}
        </Card>
      )}
    </>
  );
}

function DraftCard({ draft, accounts, onChange, onConfirm, onCancel, busy }: { draft: Draft; accounts: Account[]; onChange: (p: Partial<Draft>) => void; onConfirm: () => void; onCancel: () => void; busy: boolean }) {
  const dollars = (Number(draft.amountCents) / 100).toFixed(2);
  const choices = accounts.filter((a) => a.kind === draft.kind);
  return (
    <div className="mt-4 rounded-card border border-border bg-surface-sunken p-4">
      <p className="mb-3 text-xs uppercase tracking-wider text-muted">Draft — review before posting</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <label className="block"><span className="mb-1 block text-xs text-muted">Description</span><input value={draft.description} onChange={(e) => onChange({ description: e.target.value })} className="input" /></label>
        <label className="block"><span className="mb-1 block text-xs text-muted">Date</span><input type="date" value={draft.date} onChange={(e) => onChange({ date: e.target.value })} className="input" /></label>
        <label className="block"><span className="mb-1 block text-xs text-muted">Amount ($, {draft.kind.toLowerCase()})</span>
          <input value={Math.abs(Number(dollars)).toString()} onChange={(e) => { const cents = Math.round(Number(e.target.value || 0) * 100); onChange({ amountCents: (draft.kind === "EXPENSE" ? -cents : cents).toString() }); }} inputMode="decimal" className="input" /></label>
        <label className="block"><span className="mb-1 block text-xs text-muted">Category (Schedule F)</span>
          <select value={draft.accountCode} onChange={(e) => { const a = accounts.find((x) => x.code === e.target.value); onChange({ accountCode: e.target.value, accountLabel: a?.label ?? draft.accountLabel }); }} className="input">
            {choices.map((a) => <option key={a.code} value={a.code}>{a.label}</option>)}
          </select></label>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-sm text-muted">Posts as <Money cents={draft.amountCents} sign /></span>
        <div className="flex gap-2">
          <button onClick={onCancel} className="rounded-btn border border-border px-4 py-2 text-sm text-ink hover:bg-tag/40">Cancel</button>
          <button onClick={onConfirm} disabled={busy} className="inline-flex items-center gap-1.5 rounded-btn bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-deep disabled:opacity-50"><CheckCircle2 size={14} /> {busy ? "Posting…" : "Confirm & post"}</button>
        </div>
      </div>
    </div>
  );
}
