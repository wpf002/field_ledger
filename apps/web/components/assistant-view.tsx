"use client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import clsx from "clsx";
import { Sparkles, PencilLine, Camera, Send, Upload } from "lucide-react";

type Tab = "chat" | "quicklog" | "receipt";

const SUGGESTIONS = [
  "Analyze my current cashflow situation",
  "What inventory is ready for market?",
  "Review my upcoming expenses and liabilities",
  "Help me optimize my feed budget",
  "When should I plan my next harvest?",
];

const TABS: { value: Tab; label: string; icon: typeof Sparkles }[] = [
  { value: "chat", label: "Chat", icon: Sparkles },
  { value: "quicklog", label: "Quick Log", icon: PencilLine },
  { value: "receipt", label: "Receipt Capture", icon: Camera },
];

export function AssistantView() {
  const [tab, setTab] = useState<Tab>("chat");

  return (
    <>
      <div className="mb-6 inline-flex gap-2">
        {TABS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={clsx(
              "flex items-center gap-2 rounded-pill px-4 py-2 text-sm transition",
              tab === value ? "bg-surface text-ink shadow-card" : "text-muted hover:bg-tag/40",
            )}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {tab === "chat" && (
        <Card className="flex min-h-[460px] flex-col p-6">
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mint text-primary"><Sparkles size={22} /></span>
            <h3 className="mt-4 font-serif text-2xl font-semibold text-ink">Welcome to your AI Ranch Hand</h3>
            <p className="mt-1 max-w-md text-sm text-muted">Ask me anything about your operation — finances, planning, market timing, and more.</p>
            <div className="mt-6 w-full max-w-xl space-y-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="w-full rounded-btn border border-border px-4 py-3 text-left text-sm text-ink hover:bg-tag/30">{s}</button>
              ))}
            </div>
          </div>
          <div className="mt-6 flex items-center gap-2 rounded-btn border border-border px-4 py-2">
            <input className="w-full bg-transparent text-sm outline-none placeholder:text-muted" placeholder="Ask about your farm operations..." />
            <button className="rounded-btn bg-primary p-2 text-white hover:bg-primary-deep"><Send size={15} /></button>
          </div>
        </Card>
      )}

      {tab === "quicklog" && (
        <Card className="p-6">
          <h3 className="font-serif text-xl font-semibold text-ink">Quick Log</h3>
          <p className="mt-1 text-sm text-muted">Describe a transaction in plain English. We&rsquo;ll draft it for your confirmation before posting.</p>
          <textarea rows={4} className="mt-4 w-full rounded-btn border border-border p-3 text-sm outline-none placeholder:text-muted" placeholder="e.g. Sold 5 head of cattle at auction for $6,730.65" />
          <div className="mt-3 flex justify-end">
            <button className="rounded-btn bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-deep">Draft Transaction</button>
          </div>
        </Card>
      )}

      {tab === "receipt" && (
        <Card className="p-6">
          <h3 className="font-serif text-xl font-semibold text-ink">Receipt Capture</h3>
          <p className="mt-1 text-sm text-muted">Upload a receipt photo. We&rsquo;ll parse it into a categorized draft transaction for your review.</p>
          <div className="mt-4 flex flex-col items-center gap-2 rounded-card border-2 border-dashed border-border py-14 text-center">
            <Upload size={26} className="text-muted" />
            <p className="text-sm text-muted">Drop a receipt image here, or click to upload</p>
          </div>
        </Card>
      )}
    </>
  );
}
