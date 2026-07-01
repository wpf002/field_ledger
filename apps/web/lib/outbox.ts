"use client";

/**
 * Phase 8 offline outbox. Field use of Quick Log + Receipt Capture must survive
 * no-signal: a confirmed draft that can't reach the API is queued in IndexedDB
 * and replayed (in order) when connectivity returns. Money stays integer cents
 * end-to-end (Invariant 1) — we queue the exact request body, never a float.
 */
export type OutboxItem = {
  id: string;
  farmId: string;
  /** Exact POST body for /farms/:id/transactions — amountCents is a string. */
  body: { date: string; description: string; accountCode: string; amountCents: string };
  createdAt: number;
};

const DB_NAME = "fl-offline";
const STORE = "outbox";
const CHANGED = "fl-outbox-changed";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const r = fn(t.objectStore(STORE));
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        t.oncomplete = () => db.close();
      }),
  );
}

/** Notify listeners (sync banner, assistant view) that the queue changed. */
function announce() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGED));
}
export const OUTBOX_CHANGED = CHANGED;

export async function enqueue(item: Omit<OutboxItem, "id" | "createdAt"> & { createdAt: number }): Promise<OutboxItem> {
  // Deterministic id from farm + createdAt + a body hash — no Math.random (SSR-safe).
  const key = `${item.farmId}:${item.createdAt}:${item.body.amountCents}:${item.body.description}`;
  const full: OutboxItem = { ...item, id: key };
  await tx("readwrite", (s) => s.put(full));
  announce();
  return full;
}

export async function allItems(): Promise<OutboxItem[]> {
  const items = await tx<OutboxItem[]>("readonly", (s) => s.getAll() as IDBRequest<OutboxItem[]>);
  return items.sort((a, b) => a.createdAt - b.createdAt);
}

export async function removeItem(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id));
  announce();
}

export async function pendingCount(): Promise<number> {
  try {
    return await tx<number>("readonly", (s) => s.count());
  } catch {
    return 0;
  }
}
