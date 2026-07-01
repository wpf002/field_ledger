"use client";
import { allItems, removeItem, type OutboxItem } from "./outbox";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

let flushing = false;

/**
 * Replay queued transactions in creation order. Runs at most once at a time
 * (a reconnect + a manual trigger can race). A 2xx or a 4xx both retire the
 * item: 4xx (e.g. locked period, 403) will never succeed on retry, so we drop
 * it rather than block the queue forever. Network errors leave it queued.
 * Returns {synced, failed} for the banner.
 */
export async function flushOutbox(): Promise<{ synced: number; failed: number }> {
  if (flushing || (typeof navigator !== "undefined" && !navigator.onLine)) return { synced: 0, failed: 0 };
  flushing = true;
  let synced = 0;
  let failed = 0;
  try {
    const items = await allItems();
    for (const item of items) {
      try {
        const res = await postOne(item);
        if (res.ok) {
          await removeItem(item.id);
          synced++;
        } else if (res.status >= 400 && res.status < 500) {
          await removeItem(item.id); // permanent rejection — don't wedge the queue
          failed++;
        } else {
          break; // 5xx — stop; try the whole queue again later
        }
      } catch {
        break; // offline mid-flush — keep the rest queued
      }
    }
  } finally {
    flushing = false;
  }
  return { synced, failed };
}

function postOne(item: OutboxItem) {
  return fetch(`${API}/farms/${item.farmId}/transactions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(item.body),
  });
}
