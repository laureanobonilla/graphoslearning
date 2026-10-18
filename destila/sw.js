// Destila: recibe los audios que se comparten desde WhatsApp (Android, app instalada) y se los pasa a la página.
// No guarda nada en caché para trabajar sin conexión: solo atiende el «Compartir».
const SHARE_CACHE = 'destila-compartidos';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST' || url.pathname !== '/destila/compartir') return;
  event.respondWith((async () => {
    const form = await event.request.formData(), files = form.getAll('audios'), cache = await caches.open(SHARE_CACHE);
    for (const k of await cache.keys()) await cache.delete(k);
    let i = 0;
    for (const f of files) {
      if (!(f instanceof File)) continue;
      await cache.put(new Request('/destila/compartido/' + (i++)), new Response(f, { headers: { 'content-type': f.type || 'application/octet-stream', 'x-nombre': encodeURIComponent(f.name || ('audio-' + i + '.ogg')) } }));
    }
    return Response.redirect('/destila/?compartido=' + i, 303);
  })());
});
