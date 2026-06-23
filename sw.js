// Service worker: offline support without going stale.
// Strategy: network-first for the app shell + data (freshness wins, cache is the offline
// fallback); cache-first only for the immutable vendored libraries.
const VERSION = 'hever-v3';
const SHELL = [
  './', './index.html', './style.css', './app.js', './normalize.js', './data.json',
  './manifest.webmanifest', './icon.svg',
  './vendor/leaflet.css', './vendor/leaflet.js',
  './vendor/MarkerCluster.css', './vendor/MarkerCluster.Default.css', './vendor/leaflet.markercluster.js',
  './vendor/images/marker-icon.png', './vendor/images/marker-icon-2x.png', './vendor/images/marker-shadow.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      // bypass HTTP cache so a version bump always pulls fresh files
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })))))
      .then(() => self.skipWaiting())
  );
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSION && k.startsWith('hever-v')).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const networkFirst = async (req) => {
  try {
    const r = await fetch(req);
    if (r && r.ok) { const cp = r.clone(); caches.open(VERSION).then((c) => c.put(req, cp)); }
    return r;
  } catch (e) {
    const cached = await caches.match(req);
    if (cached) return cached;
    throw e;
  }
};
const cacheFirst = async (req) => {
  const cached = await caches.match(req);
  if (cached) return cached;
  const r = await fetch(req);
  const cp = r.clone(); caches.open(VERSION).then((c) => c.put(req, cp));
  return r;
};

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin === self.location.origin) {
    // immutable libs: cache-first; everything else (html/js/css/json): network-first
    e.respondWith(url.pathname.includes('/vendor/') ? cacheFirst(e.request) : networkFirst(e.request));
    return;
  }
  // cross-origin (hvr datasets, OSM tiles, fonts): network, cache map tiles, fall back to cache
  e.respondWith(
    fetch(e.request)
      .then((r) => { if (url.hostname.includes('tile.openstreetmap.org')) { const cp = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, cp)); } return r; })
      .catch(() => caches.match(e.request))
  );
});
