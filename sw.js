// SHUTO service worker: the game shell is fetched network-first (updates show up on the next launch),
// map packs are cached per release (cache-first) so revisits load fast and work with a weak connection.
const VERSION = 'v3.9';
const CACHE = 'shuto-' + VERSION;
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  const pack = u.pathname.includes('/data/');
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    if (pack) {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const r = await fetch(e.request);
      if (r.ok) c.put(e.request, r.clone());
      return r;
    }
    try {
      const r = await fetch(e.request, { cache: 'no-cache' });
      if (r.ok) c.put(e.request, r.clone());
      return r;
    } catch (x) {
      const hit = await c.match(e.request);
      if (hit) return hit;
      throw x;
    }
  })());
});
