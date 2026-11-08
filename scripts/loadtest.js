// Load test with a FAKE Groq (same limits as the free tier: 8,000 tokens/min, 1,000 requests/day, ~0.4s latency,
// real 429 + retry-after) so no real quota is burned. Simulates N students on the web and via the Telegram webhook.
// usage: node scripts/loadtest.js <students> [rampSeconds]
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const N = Number(process.argv[2] || 100); const RAMP = Number(process.argv[3] || 60);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- fake Groq ----
const win = {}; let fakeCalls = 0, fake429 = 0;
const fake = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => { b += c; });
  req.on('end', () => {
    const j = JSON.parse(b || '{}'); const m = j.model; const now = Date.now();
    win[m] = (win[m] || []).filter((x) => now - x.t < 60000);
    const used = win[m].reduce((a, x) => a + x.n, 0); const tokens = 700 + Math.floor(Math.random() * 250); // measured: ~800 total tokens per call
    if (used + tokens > 8000) { fake429++; res.writeHead(429, { 'retry-after': '8', 'content-type': 'application/json' }); return res.end('{}'); }
    win[m].push({ t: now, n: tokens }); fakeCalls++;
    const ctx = JSON.parse(b).messages[1].content; const src = (ctx.match(/\[S1\] ([^\n]{0,80})/) || [])[1] || 'x';
    setTimeout(() => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message: { content: `${src.split('.')[0]} [S1]` } }], usage: { total_tokens: tokens } })); }, 400);
  });
}).listen(4301);

const DOUBTS_COMMON = ['why add acid to water and not water to acid', 'difference between alkali and base', 'what is a displacement reaction', 'why is sodium kept in kerosene', 'what is rancidity', 'why does graphite conduct electricity'];
const pct = (a, p) => a.length ? a.sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : 0;

(async () => {
  const PORT = 4302; const base = `http://localhost:${PORT}`;
  const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT, TRUST_PROXY: '1', GROQ_API_KEY: 'fake', GROQ_BASE_URL: 'http://localhost:4301', TELEGRAM_WEBHOOK_SECRET: 'loadsecret', TELEGRAM_BOT_TOKEN: '', REDPEN_STORE: '/tmp/rp-load-store' } });
  await sleep(1000);
  const lat = { static: [], api: [], heavy: [], bot: [] }; const codes = {};
  const hit = async (kind, ip, p, opt = {}) => {
    const t = Date.now();
    try { const r = await fetch(base + p, { ...opt, headers: { 'x-forwarded-for': `10.1.${ip >> 8 & 255}.${ip & 255}`, 'content-type': 'application/json', ...(opt.headers || {}) } }); await r.arrayBuffer(); codes[`${kind}:${r.status}`] = (codes[`${kind}:${r.status}`] || 0) + 1; lat[kind].push(Date.now() - t); return r.status; }
    catch { codes[`${kind}:err`] = (codes[`${kind}:err`] || 0) + 1; return 0; }
  };
  const cpu0 = (await (await fetch(base + '/healthz')).json());
  const student = async (i) => {
    await sleep(Math.random() * RAMP * 1000);
    await hit('static', i, '/'); await hit('static', i, '/app.js'); await hit('api', i, '/api/chapters');
    const ch = 'ch' + (1 + (i % 4));
    await hit('api', i, `/api/questions?chapter=${ch}`);
    for (let k = 0; k < 3; k++) {
      await sleep(2000 + Math.random() * 6000);
      const unique = Math.random() < 0.5; const d = unique ? `${DOUBTS_COMMON[i % 6]} variant ${i} ${k}` : DOUBTS_COMMON[(i + k) % 6];
      await hit('heavy', i, '/api/doubt', { method: 'POST', body: JSON.stringify({ doubt: d, chapterId: ch }) });
    }
    await hit('heavy', i, '/api/grade', { method: 'POST', body: JSON.stringify({ questionId: `${ch}-q1`, answer: 'some answer about the reaction and the product formed' }) });
    // Telegram (webhook) - 4 messages per student
    let uid = 0;
    for (const text of ['/start', '/formulas', 'why is rust bad', '/extra']) {
      await hit('bot', i, '/telegram/loadsecret', { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'loadsecret' }, body: JSON.stringify({ update_id: i * 10 + (++uid), message: { chat: { id: 50000 + i }, text } }) });
      await sleep(1500);
    }
  };
  const t0 = Date.now();
  await Promise.all(Array.from({ length: N }, (_, i) => student(i)));
  await sleep(1500);
  const secs = (Date.now() - t0) / 1000;
  const h = await (await fetch(base + '/healthz')).json();
  const total = Object.values(lat).reduce((a, x) => a + x.length, 0);
  const out = { students: N, rampSec: RAMP, durationSec: Math.round(secs), requests: total, rps: +(total / secs).toFixed(1),
    latencyMs: Object.fromEntries(Object.entries(lat).map(([k, v]) => [k, { n: v.length, p50: pct([...v], 0.5), p95: pct([...v], 0.95), p99: pct([...v], 0.99) }])),
    statusCodes: codes, server: { rssMB: h.rssMB, cpuSecPerRequest: h.cpuSec !== undefined ? +((h.cpuSec - (cpu0.cpuSec || 0)) / total).toFixed(5) : null },
    llm: { callsToGroq: fakeCalls, fake429FromGroq: fake429, cacheHits: h.llm.cacheHit, deduped: h.llm.deduped, fallbacks: h.llm.fallback, queueFull: h.llm.queueFull, budgetDenied: h.llm.budgetDenied }, limiter: h.limiter, bot: h.bot };
  console.log(JSON.stringify(out, null, 1));
  srv.kill(); fake.close(); process.exit(0);
})();
