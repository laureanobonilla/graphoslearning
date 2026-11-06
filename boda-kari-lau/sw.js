// Service worker mínimo: permite instalar la app y abrir la página aunque no haya conexión.
// Los datos (la lista) siempre se piden a la red; nunca se guardan en caché.
const C = 'boda-kl-v1', SHELL = ['/boda-kari-lau/', '/boda-kari-lau/icon-192.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(C).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== C).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
    const r = e.request, u = new URL(r.url);
    if (r.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/.netlify/')) return;
    if (r.mode === 'navigate') e.respondWith(fetch(r).then((x) => { const k = x.clone(); caches.open(C).then((c) => c.put('/boda-kari-lau/', k)); return x; }).catch(() => caches.match('/boda-kari-lau/')));
    else e.respondWith(caches.match(r).then((m) => m || fetch(r)));
});
