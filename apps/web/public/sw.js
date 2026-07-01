/* Field & Ledger service worker — Phase 8 offline-first.
 * Registered in PRODUCTION ONLY (see offline-sync.tsx) — a SW intercepting
 * Next dev's HMR/RSC traffic breaks it. Goals: installability + a loadable app
 * shell in the field. We never touch the API origin (:4000) or non-GET requests
 * (writes go through the IndexedDB outbox), and we pass RSC/data requests
 * straight to the network so navigations never serve stale server data. */
const CACHE = "fl-shell-v2";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.add(OFFLINE_URL)).catch(() => {}));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // writes are queued client-side, never cached
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // cross-origin: hands off
  if (url.pathname.startsWith("/api/")) return; // proxied API — always network
  // React Server Component / data fetches must stay fresh — don't intercept.
  if (url.searchParams.has("_rsc") || req.headers.get("RSC") === "1") return;

  // Full-page navigations: network-first, fall back to the last cached page,
  // then to a friendly offline page. Never Response.error() (blank screen).
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && res.type === "basic") caches.open(CACHE).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(async () => (await caches.match(req)) || (await caches.match(OFFLINE_URL)) || new Response("Offline", { status: 503 })),
    );
    return;
  }

  // Immutable hashed assets: cache-first is safe and fast.
  if (url.pathname.startsWith("/_next/static/") || /\.(css|js|woff2?|svg|png|ico)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
  }
  // Everything else: default network handling (no respondWith).
});
