// Service worker mínimo: hace que el navegador ofrezca instalar la app. No guarda nada en caché (siempre va a la red).
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function () { /* pasa directo a la red */ });
