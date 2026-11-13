// Service worker mínimo: permite instalar la app y abrir la página aunque no haya conexión.
// Nada de las cuentas, pagos ni transcripciones pasa por la caché: todo lo de /.netlify/ va siempre a la red.
const C = 'rotulo-v1', SHELL = ['/subtitulos/', '/subtitulos/icon-192.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(C).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== C).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
    const r = e.request, u = new URL(r.url);
    if (r.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/.netlify/')) return;
    if (r.mode === 'navigate') e.respondWith(fetch(r).then((x) => { const k = x.clone(); caches.open(C).then((c) => c.put('/subtitulos/', k)); return x; }).catch(() => caches.match('/subtitulos/')));
    else e.respondWith(caches.match(r).then((m) => m || fetch(r)));
});
