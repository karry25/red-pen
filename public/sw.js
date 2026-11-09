// Red Pen service worker: caches the app shell so it opens offline.
// Study content (/api/*) is network-first and falls back to the last copy; AI answers, grading,
// video search and compare need the internet and say so offline. POSTs are never cached.
const V = 'redpen-v2';
const SHELL = ['/', '/style.css', '/app.js', '/extras.js', '/study.js', '/fun.js', '/icons.js', '/manifest.webmanifest', '/pwa/icon-192.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const r = e.request; const u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.startsWith('/api/videos/find') || u.pathname === '/healthz') return;
  e.respondWith(fetch(r).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(V).then((c) => c.put(r, copy)); } return res; })
    .catch(() => caches.match(r).then((m) => m || new Response(JSON.stringify({ error: 'You are offline. This part needs the internet.' }), { status: 503, headers: { 'Content-Type': 'application/json' } }))));
});
