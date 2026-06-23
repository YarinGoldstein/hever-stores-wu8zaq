// Service worker: offline app shell + data. Cache-first for shell, network-first for data.json.
const VERSION = 'hever-v2';
const SHELL = [
  './', './index.html', './style.css', './app.js', './normalize.js', './data.json',
  './manifest.webmanifest', './icon.svg',
  './vendor/leaflet.css', './vendor/leaflet.js',
  './vendor/MarkerCluster.css', './vendor/MarkerCluster.Default.css', './vendor/leaflet.markercluster.js',
  './vendor/images/marker-icon.png', './vendor/images/marker-icon-2x.png', './vendor/images/marker-shadow.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION && k.startsWith('hever-v')).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // App-origin requests: cache-first, fall back to network, then cache the result.
  if (url.origin === self.location.origin) {
    const isData = url.pathname.endsWith('data.json');
    if (isData) {
      // network-first for our bundled snapshot
      e.respondWith(fetch(e.request).then((r) => { const cp = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
      return;
    }
    e.respondWith(caches.match(e.request).then((c) => c || fetch(e.request).then((r) => { const cp = r.clone(); caches.open(VERSION).then((cc) => cc.put(e.request, cp)); return r; })));
    return;
  }
  // Cross-origin (hvr datasets, OSM tiles, fonts): network, fall back to cache if present.
  e.respondWith(fetch(e.request).then((r) => {
    if (url.hostname.includes('tile.openstreetmap.org')) { const cp = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, cp)); }
    return r;
  }).catch(() => caches.match(e.request)));
});
