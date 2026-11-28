// Crystal-Ball service worker. Conservative caching to avoid stale content:
// - HTML/JSON: network-first (fresh on every load; cache only as offline fallback)
// - hashed /assets/*: cache-first (filenames change per build, so always safe)
// Same-origin GETs only — never intercepts CoinGecko/Yahoo/etc.

const CACHE = "cb-cache-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // leave cross-origin alone

  // Immutable hashed assets → cache-first.
  if (url.pathname.includes("/assets/")) {
    e.respondWith(
      caches.open(CACHE).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        c.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // Everything else (HTML, data JSON) → network-first, cache fallback offline.
  e.respondWith(
    (async () => {
      try {
        const res = await fetch(req);
        const c = await caches.open(CACHE);
        c.put(req, res.clone());
        return res;
      } catch {
        const hit = await caches.match(req);
        if (hit) return hit;
        throw new Error("offline and not cached");
      }
    })(),
  );
});
