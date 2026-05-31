const CACHE = 'zafraan-v6';

const PRECACHE = [
  './',
  './index.html',
  './firebase-config.js',
  './manifest.json',
  './icon.svg',
  './zafraan-images/01-peeled-garlic.png',
  './zafraan-images/02-peeled-small-onion.png',
  './zafraan-images/02-peeled-ginger.png',
  './zafraan-images/03-chopped-onion.png',
  './zafraan-images/04-cut-carrot.png',
  './zafraan-images/04-veg-pack.png',
  './zafraan-images/05-curry-leaves.png',
  './zafraan-images/05-cut-ladies-finger.png',
  './zafraan-images/06-coriander-leaves.png',
  './zafraan-images/06-cut-pumpkin.png',
  './zafraan-images/07-cut-drumstick.png',
  './zafraan-images/07-mint-leaves.png',
  './zafraan-images/08-cut-beans.png',
  './zafraan-images/08-garlic-powder.png',
  './zafraan-images/09-onion-powder.png',
  './zafraan-images/10-ginger-powder.png',
  './zafraan-images/11-peri-peri-powder.png',
  './zafraan-images/12-chilli-flakes.png',
  './zafraan-images/13-oregano.png',
  './zafraan-images/14-italian-seasoning.png',
  './zafraan-images/15-mayonnaise.png',
  './zafraan-images/16-peri-mayo.png',
  './zafraan-images/17-garlic-mayo.png',
  './zafraan-images/18-mint-mayo.png',
  './zafraan-images/19-plain-makhana.png',
  './zafraan-images/20-peri-makhana.png',
  './zafraan-images/21-salt-pepper-makhana.png',
  './zafraan-images/22-mint-makhana.png',
  './zafraan-images/23-pizza-combo.png',
  './zafraan-images/24-burger-combo.png'
];

// Install: pre-cache all static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

// Activate: clean up old cache versions
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: cache-first for images & static, network-first for HTML
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET and cross-origin (Firebase, Google Fonts, etc.)
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;

  // HTML pages: network-first so content stays fresh
  if (event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(event.request)
        .then(res => { caches.open(CACHE).then(c => c.put(event.request, res.clone())); return res; })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Everything else (images, JS, SVG): cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        caches.open(CACHE).then(c => c.put(event.request, res.clone()));
        return res;
      });
    })
  );
});
