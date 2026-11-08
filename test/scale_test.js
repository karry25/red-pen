// Scaling / free-tier protection tests (no real Groq or Telegram calls).
const { spawn } = require('child_process');
const path = require('path');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runScaleTests(check) {
  const { Limiter, DailyCap } = require('../lib/limits');
  const l = new Limiter({ rate: 1, burst: 3, maxKeys: 3 });
  const t0 = 1_000_000;
  check('limiter: burst of 3 then blocked, retry-after given', l.take('a', t0).ok && l.take('a', t0).ok && l.take('a', t0).ok && !l.take('a', t0).ok && l.take('a', t0).retryAfterSec >= 1);
  check('limiter: refills over time', l.take('a', t0 + 2100).ok);
  ['k1', 'k2', 'k3', 'k4', 'k5'].forEach((k) => l.take(k, t0));
  check('limiter: memory capped (maxKeys) so fake identities cannot grow RAM', l.map.size <= 3);
  const d = new DailyCap({ max: 2 });
  const noon = Date.parse('2026-11-09T12:00:00+05:30');
  check('daily cap: 2 allowed, 3rd blocked, resets next IST day', d.take('x', noon) && d.take('x', noon) && !d.take('x', noon) && d.take('x', noon + 86400000));

  // LLM gate with a fake transport
  const gate = require('../lib/llmgate');
  let calls = 0; const orig = gate.gate.transport;
  gate.reset();
  gate.gate.transport = async (model) => { calls++; await sleep(20); return { text: `ans from ${model}`, tokens: 300 }; };
  const [a, b] = await Promise.all([gate.call('role', 'What is pH?'), gate.call('role', 'what is   pH?')]);
  check('gate: identical concurrent questions share one LLM call (dedupe + normalisation)', calls === 1 && a === b);
  await gate.call('role', 'WHAT IS PH?');
  check('gate: repeat question served from cache (0 extra tokens)', calls === 1 && gate.snapshot().cacheHit >= 1);

  gate.reset(); calls = 0;
  gate.gate.transport = async (model) => { calls++; if (model.endsWith('120b')) { const e = new Error('429'); e.status = 429; e.retryAfter = 10; throw e; } return { text: 'from-20b', tokens: 200 }; };
  check('gate: 429 on the first model falls over to the next model', (await gate.call('role', 'q1')) === 'from-20b');
  const c0 = calls; await gate.call('role', 'q2');
  check('gate: a 429-ed model is left alone during retry-after (no hammering)', calls === c0 + 1 && gate.snapshot().models['openai/gpt-oss-120b'].coolingDown);

  gate.reset();
  gate.gate.transport = async () => { const e = new Error('429'); e.status = 429; e.retryAfter = 5; throw e; };
  let threw = false; try { await gate.call('role', 'q3'); } catch { threw = true; }
  check('gate: all models limited -> throws so the agent uses its rule-based fallback', threw);

  gate.reset(); gate.cfg.maxConcurrent = 1; gate.cfg.maxQueue = 2; gate.cfg.maxWaitMs = 400;
  gate.gate.transport = async () => { await sleep(150); return { text: 'ok', tokens: 100 }; };
  const res = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => gate.call('role', `distinct ${i}`)));
  const ok = res.filter((r) => r.status === 'fulfilled').length;
  check('gate: bounded queue - overflow rejected quickly (never an unbounded pile-up)', ok >= 1 && ok < 8 && gate.snapshot().queueFull > 0);
  gate.cfg.maxConcurrent = 3; gate.cfg.maxQueue = 12; gate.cfg.maxWaitMs = 3000;

  gate.reset();
  gate.gate.transport = async () => ({ text: 'x', tokens: 6000 });
  for (let i = 0; i < 6; i++) await gate.call('role', `big ${i}`).catch(() => {});
  const snap = gate.snapshot();
  check('gate: stays under the 8,000 tokens/min free limit per model (85% headroom)', Object.values(snap.models).every((m) => m.tokensLastMin <= 8000 * 0.85 + 1) && snap.fallback > 0);
  gate.gate.transport = orig; gate.reset();

  // Agent falls back to rule-based answers when the gate refuses (student never sees an error)
  const { Agent } = require('../agents/base');
  const ag = new Agent({ name: 't', role: 'r' }); ag.setBrain(async () => { throw new Error('queue_full'); });
  check('agent: brain failure -> rule-based fallback answer', (await ag.think('c', () => 'fallback ok')) === 'fallback ok');

  // Telegram admission, dedupe, ordering, webhook secret
  const { TelegramAdapter } = require('../connectors/telegram');
  const bot = new TelegramAdapter();
  const now = Date.now(); let notices = 0;
  for (let i = 0; i < 30; i++) { const v = bot.admit(777, 'what is a salt', now); if (v && v.notice) notices++; }
  check('telegram: flood from one chat is limited and warned at most once per 30s', bot.heavyLimit.map.size === 1 && notices === 1);
  check('telegram: a different chat is unaffected by the flood', bot.admit(778, 'what is a salt', now) === null);
  let n = 0; bot.heavyDay.max = 3; const b2 = new TelegramAdapter(); b2.heavyDay.max = 3; b2.heavyLimit = new Limiter({ rate: 100, burst: 100 }); b2.msgLimit = new Limiter({ rate: 100, burst: 100 });
  for (let i = 0; i < 5; i++) { if (!b2.admit(5, 'doubt text', now)) n++; }
  check('telegram: per-chat daily cap on heavy requests', n === 3);
  check('telegram: cheap commands (/formulas, /extra) still allowed after the daily cap', b2.admit(5, '/formulas', now) === null && b2.admit(5, '/extra', now) === null);
  const b3 = new TelegramAdapter(); const order = [];
  const orig2 = b3.handleUpdate.bind(b3);
  b3.handleUpdate = async (u) => { await sleep(u.slow ? 60 : 1); order.push(u.update_id); };
  await Promise.all([b3.enqueue({ update_id: 1, slow: true, message: { chat: { id: 9 }, text: '/formulas' } }), b3.enqueue({ update_id: 2, message: { chat: { id: 9 }, text: '/formulas' } }), b3.enqueue({ update_id: 1, message: { chat: { id: 9 }, text: '/formulas' } })]);
  check('telegram: duplicate update_id ignored; messages from one chat handled in order', order.join() === '1,2' && b3.stats.dupes === 1);
  void orig2;

  // real server with limits ON
  const PORT = 4198; const base = `http://localhost:${PORT}`;
  const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT, TELEGRAM_WEBHOOK_SECRET: 'testsecret123', TELEGRAM_BOT_TOKEN: '' } });
  await sleep(800);
  try {
    const codes = [];
    for (let i = 0; i < 10; i++) codes.push((await fetch(base + '/api/compare', { method: 'POST', body: '{}' })).status);
    const lim = await fetch(base + '/api/compare', { method: 'POST', body: '{}' });
    check('server: heavy route limited with 429 + Retry-After after the burst', codes.filter((c) => c === 429).length >= 3 && lim.status === 429 && !!lim.headers.get('retry-after'));
    check('server: light routes unaffected by heavy-route limit', (await fetch(base + '/api/chapters')).status === 200);
    const hz = await (await fetch(base + '/healthz')).json();
    check('server: /healthz exposes counters but no secrets', hz.ok && !!hz.limiter && !JSON.stringify(hz).match(/gsk_|bot\d{5,}:|testsecret/));
    const r1 = await fetch(base + '/', { headers: { 'accept-encoding': 'gzip' } });
    check('server: static assets are gzip-compressed with security headers', r1.headers.get('content-encoding') === 'gzip' && /default-src 'self'/.test(r1.headers.get('content-security-policy')) && r1.headers.get('x-content-type-options') === 'nosniff');
    const w1 = await fetch(base + '/telegram/testsecret123', { method: 'POST', body: '{}' });
    const w2 = await fetch(base + '/telegram/wrongsecret', { method: 'POST', body: '{}', headers: { 'x-telegram-bot-api-secret-token': 'testsecret123' } });
    const w3 = await fetch(base + '/telegram/testsecret123', { method: 'POST', body: '{"update_id":1,"message":{"chat":{"id":5},"text":"/formulas"}}', headers: { 'x-telegram-bot-api-secret-token': 'testsecret123' } });
    check('webhook: rejects missing/wrong secret header; wrong path is just a 404', w1.status === 401 && w2.status !== 200 && w3.status === 200);
  } finally { srv.kill(); }
}
module.exports = { runScaleTests };
