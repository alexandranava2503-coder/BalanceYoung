/* Balance Young · service worker
   Siempre pide la versión más reciente a internet. Solo si no hay conexión
   muestra la última copia guardada, para que la app abra aunque estés offline.
   No guarda tus datos financieros: esos viven en tu cuenta (Supabase). */
const CACHE = 'by-v1';
const SHELL = ['/', '/app.js', '/privacidad', '/manifest.webmanifest', '/logo-icon.png', '/icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;   // Supabase, fuentes y formularios van directo a internet
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, {ignoreSearch: true})
      .then(r => r || (req.mode === 'navigate' ? caches.match('/') : Response.error())))
  );
});
