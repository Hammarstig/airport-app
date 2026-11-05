/* Gatelog service worker. Versionen och förcache-listan fylls i vid bygget (se pwa/plugin.js). */
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const SHELL = `gatelog-shell-${VERSION}`;
const RUNTIME = 'gatelog-runtime';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith('gatelog-shell-') && k !== SHELL).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // API och uppladdade foton går alltid mot nätet (appen har egen minnescache).
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return;

  if (req.mode === 'navigate') {
    // Nätet först så att nya versioner syns direkt; app-skalet eller offlinesidan som reserv.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(async () => (await caches.match(OFFLINE_URL)) || Response.error())
    );
    return;
  }

  // Hashade byggfiler och statiska filer: cache först, annars nätet och spara.
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (
            res.ok &&
            (url.pathname.startsWith('/assets/') || /\.(svg|png|webp|ico|webmanifest|woff2?)$/.test(url.pathname))
          ) {
            const copy = res.clone();
            caches.open(RUNTIME).then((c) => c.put(req, copy));
          }
          return res;
        })
    )
  );
});
