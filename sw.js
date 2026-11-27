const CACHE_NAME = 'captain-battleship-v17-server-2';
const ASSETS = [
  '/', '/index.html', '/rules.js', '/room.js', '/manifest.json',
  '/assets/tracks/day.mp3', '/assets/tracks/night.mp3',
  '/fleet-materials.js', '/scene3d.js', '/fleet-view.js', '/board-view.js',
  '/assets/fleet3d/albedo.png', '/assets/fleet3d/surface.png', '/assets/fleet3d/ocean.jpg'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith('captain-battleship-') && key !== CACHE_NAME)
    .map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin ||
      !ASSETS.includes(url.pathname) || event.request.headers.has('range')) return;

  event.respondWith(fetch(event.request).catch(async () => {
    const cache = await caches.open(CACHE_NAME);
    return (await cache.match(url.pathname)) || Response.error();
  }));
});

