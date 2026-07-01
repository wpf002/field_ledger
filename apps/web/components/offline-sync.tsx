"use client";
import { useEffect, useState } from "react";
import { CloudOff, RefreshCw, CheckCircle2 } from "lucide-react";
import { pendingCount, OUTBOX_CHANGED } from "@/lib/outbox";
import { flushOutbox } from "@/lib/sync";

/**
 * Mounted once in the app shell. Registers the service worker (installability +
 * offline app-shell), tracks online/offline, and drains the outbox whenever the
 * connection returns or the queue changes. Renders a small fixed status banner
 * only when there's something to say (offline, pending, or just-synced).
 */
export function OfflineSync() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [justSynced, setJustSynced] = useState(0);

  useEffect(() => {
    // Register only in production. In dev, a SW intercepting navigations/RSC
    // breaks HMR and RSC streaming; the outbox + sync below work without it.
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    setOnline(navigator.onLine);
    const refresh = () => pendingCount().then(setPending);
    refresh();

    async function drain() {
      const { synced } = await flushOutbox();
      if (synced > 0) {
        setJustSynced(synced);
        setTimeout(() => setJustSynced(0), 4000);
      }
      refresh();
    }

    const goOnline = () => { setOnline(true); drain(); };
    const goOffline = () => setOnline(false);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    window.addEventListener(OUTBOX_CHANGED, refresh);
    if (navigator.onLine) drain(); // sync anything left from a previous session

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener(OUTBOX_CHANGED, refresh);
    };
  }, []);

  if (online && pending === 0 && justSynced === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-pill bg-surface px-4 py-2 text-sm shadow-card ring-1 ring-border">
      {!online ? (
        <><CloudOff size={15} className="text-muted" /><span className="text-ink">Offline{pending > 0 ? ` — ${pending} change${pending > 1 ? "s" : ""} queued` : ""}</span></>
      ) : pending > 0 ? (
        <><RefreshCw size={15} className="animate-spin text-primary" /><span className="text-ink">Syncing {pending} change{pending > 1 ? "s" : ""}…</span></>
      ) : (
        <><CheckCircle2 size={15} className="text-positive" /><span className="text-ink">Synced {justSynced} change{justSynced > 1 ? "s" : ""}</span></>
      )}
    </div>
  );
}
