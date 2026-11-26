/* Service worker de DADINI SaaS: app shell en caché + datos con network-first.
   Las mutaciones se encolan en la app (api.js) y se reenvían al volver online. */
const CACHE = 'dadini-shell-v2';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/logo-dadini-icon.png'];

self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evento) => {
  const { request } = evento;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API: network-first para no mostrar datos viejos. Si falla y hay copia,
  // se usa la copia; si no, se devuelve una respuesta vacía tolerable.
  if (url.pathname.startsWith('/api/')) {
    evento.respondWith(
      fetch(request)
        .then((respuesta) => {
          if (respuesta.ok) {
            const copia = respuesta.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copia));
          }
          return respuesta;
        })
        .catch(async () => (await caches.match(request)) || new Response(JSON.stringify({ off_line: true }), {
          status: 503, headers: { 'Content-Type': 'application/json' },
        })),
    );
    return;
  }

  // Navegación: network-first. Un index.html cacheado puede referirse a un
  // chunk que ya no existe tras un deploy y provocar "Failed to fetch
  // dynamically imported module". Se guarda siempre como /index.html.
  if (request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html') {
    evento.respondWith(
      fetch(request)
        .then((respuesta) => {
          if (respuesta && respuesta.ok && respuesta.type === 'basic') {
            const clon = respuesta.clone();
            caches.open(CACHE).then((cache) => cache.put('/index.html', clon));
          }
          return respuesta;
        })
        .catch(async () => (await caches.match('/index.html')) || (await caches.match(request))),
    );
    return;
  }

  // Assets con hash: cache-first (son inmutables).
  evento.respondWith(
    caches.match(request).then((copia) => {
      const red = fetch(request).then((respuesta) => {
        if (respuesta && respuesta.ok && respuesta.type === 'basic') {
          const clon = respuesta.clone();
          caches.open(CACHE).then((cache) => cache.put(request, clon));
        }
        return respuesta;
      }).catch(() => copia);
      return copia || red;
    }),
  );
});

// Permite que la app pida reenviar la cola al volver online.
self.addEventListener('message', (evento) => {
  if (evento.data && evento.data.tipo === 'SINCRONIZAR') {
    self.clients.matchAll().then((clientes) => clientes.forEach((c) => c.postMessage({ tipo: 'SINCRONIZAR' })));
  }
});
