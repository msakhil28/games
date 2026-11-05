// Service worker: network-first so updates show up immediately when online, cache fallback for offline play.
// VERSION is stamped with the commit SHA on every deploy (see .github/workflows/pages.yml).
const VERSION = 'cardroom-v4';
const FILES = ['./', 'index.html', 'styles.css', 'store.js', 'poker.js', 'blackjack.js', 'app.js', 'sfx.js', 'ui.js', 'fonts/cinzel-700.woff2', 'fonts/inter-var.woff2',
  'vendor/peerjs.min.js', 'vendor/qrcode.js', 'net.js', 'mp-host.js', 'mp-poker.js', 'mp-blackjack.js', 'mp-games.js', 'mp.js', 'ludo.js', 'business.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];

// cache: 'reload' bypasses the browser's HTTP cache, so a new version never precaches stale files.
// Files are cached one by one: a single missing file must never block an update from installing.
self.addEventListener('install', e => e.waitUntil((async () => {
  const c = await caches.open(VERSION);
  await Promise.allSettled(FILES.map(async f => {
    const res = await fetch(new Request(f, { cache: 'reload' }));
    if (res.ok) await c.put(f, res);
  }));
  await self.skipWaiting();
})()));

self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    try {
      // 'no-cache' revalidates with the server (cheap 304 when unchanged) instead of trusting the HTTP cache.
      const res = await fetch(req, { cache: 'no-cache' });
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    } catch {
      return (await caches.match(req, { ignoreSearch: true }))
        || (req.mode === 'navigate' ? caches.match('index.html') : Response.error());
    }
  })());
});
