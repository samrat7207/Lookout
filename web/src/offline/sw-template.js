// Lookout service worker: a user-side cache of the built app shell (HTML, JS, CSS, assets),
// so the page still opens when the server is down. Written into dist/sw.js at build time by
// the offlineShell() plugin in vite.config.js, which fills in VERSION and SHELL.
// API calls (/api/...) and the SSE event stream are NEVER cached: they always go to the network.
const VERSION = '__VERSION__';
const SHELL = __SHELL__;
const CACHE = `lookout-shell-${VERSION}`;

self.addEventListener('install', (event) => {
  // a new build: fill its own versioned cache; the old one keeps serving until activate
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('lookout-shell-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const neverCache = (req, url) =>
  req.method !== 'GET' ||
  url.origin !== self.location.origin ||
  url.pathname.startsWith('/api/') || url.pathname === '/api' ||
  (req.headers.get('accept') ?? '').includes('text/event-stream');

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (neverCache(req, url)) return; // straight to the network, untouched
  if (req.mode === 'navigate') {
    // the page: network first (picks up a new build), cached shell when the server is down
    event.respondWith(fetch(req).catch(() => caches.match('/index.html', { cacheName: CACHE, ignoreVary: true }).then((r) => r ?? caches.match('/index.html'))));
    return;
  }
  // built assets have hashed names, so the cached copy is always the right one
  event.respondWith(caches.match(req, { cacheName: CACHE, ignoreVary: true }).then((hit) => hit ?? fetch(req)));
});
