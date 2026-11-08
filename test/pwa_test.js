// PWA files are served and well formed.
const http = require('http');
const get = (p) => new Promise((r) => http.get({ port: 4199, path: p }, (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => r({ s: res.statusCode, t: res.headers['content-type'], b })); }));
async function runPwaTests(check) {
  const m = await get('/manifest.webmanifest'); const j = JSON.parse(m.b);
  check('pwa: manifest served, standalone, start_url /', m.s === 200 && j.display === 'standalone' && j.start_url === '/');
  check('pwa: manifest has 192 and 512 png icons', ['192x192', '512x512'].every((s) => j.icons.some((i) => i.sizes === s && i.type === 'image/png')));
  for (const i of j.icons) check('pwa: icon served ' + i.src, (await get(i.src)).s === 200);
  const sw = await get('/sw.js'); check('pwa: service worker served and never caches POST', sw.s === 200 && /r\.method !== 'GET'/.test(sw.b));
  const h = await get('/'); check('pwa: index links manifest, theme-color, viewport-fit', /rel="manifest"/.test(h.b) && /theme-color/.test(h.b) && /viewport-fit=cover/.test(h.b));
}
module.exports = { runPwaTests };
