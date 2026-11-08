// Gate in front of the (free-tier) Groq API. Goals: never exceed the org-level free limits, never
// make a student wait long, never show an error. When the gate says no, callers fall back to the
// rule-based brain (Agent.think already does that when this throws).
//  - answer cache (24h, hashed keys) + in-flight de-duplication: repeated questions cost 0 tokens
//  - per-model token-per-minute and requests-per-day budgets (each model has its own free quota)
//  - model pool: tries the next model when one is out of budget or returns 429
//  - bounded queue with a short max wait (default 3s), bounded concurrency
//  - circuit breaker for 5xx / network errors
const { TTLCache } = require('./cache');

const LIMITS = { // base free limits from console.groq.com/docs/rate-limits; headroom keeps us under them
  'openai/gpt-oss-120b': { tpm: 8000, rpd: 1000, tpd: 200000 },
  'openai/gpt-oss-20b': { tpm: 8000, rpd: 1000, tpd: 200000 },
};
const HEADROOM = 0.85;
const cfg = { models: Object.keys(LIMITS), maxConcurrent: 3, maxQueue: 12, maxWaitMs: 3000, maxTokens: 800, cacheTtlMs: 24 * 3600 * 1000 };
const cache = new TTLCache({ max: 500, ttlMs: cfg.cacheTtlMs });
const inflight = new Map();
const stats = { llm: 0, cacheHit: 0, deduped: 0, fallback: 0, queueFull: 0, budgetDenied: 0, limited429: 0, errors: 0 };
const st = {}; // per model: window usage + cooldown
const sd = (m) => (st[m] = st[m] || { win: [], day: '', rpd: 0, tpd: 0, coolUntil: 0, fails: 0, openUntil: 0 });
let active = 0; const waiters = [];
const dayKey = (now) => new Date(now + 5.5 * 3600000).toISOString().slice(0, 10);

const estimate = (role, context) => Math.ceil((String(role).length + String(context).length) / 3.2) + cfg.maxTokens; // reserve completion worst case
function used(m, now) { const s = sd(m); s.win = s.win.filter((x) => now - x.t < 60000); return s.win.reduce((a, x) => a + x.n, 0); }
function canUse(m, need, now) {
  const s = sd(m), L = LIMITS[m];
  if (s.day !== dayKey(now)) { s.day = dayKey(now); s.rpd = 0; s.tpd = 0; }
  if (now < s.coolUntil || now < s.openUntil) return false;
  return used(m, now) + need <= L.tpm * HEADROOM && s.rpd + 1 <= L.rpd * HEADROOM && s.tpd + need <= L.tpd * HEADROOM;
}
const charge = (m, n, now) => { const s = sd(m); s.win.push({ t: now, n }); s.rpd += 1; s.tpd += n; };
const refund = (m, reserved, actual, now) => { const s = sd(m); const w = s.win.find((x) => x.n === reserved && x.t <= now); if (w) w.n = actual; s.tpd += actual - reserved; };

async function slot() {
  if (active < cfg.maxConcurrent) { active++; return; }
  if (waiters.length >= cfg.maxQueue) { stats.queueFull++; throw new Error('queue_full'); }
  await new Promise((res, rej) => { const w = { res, t: setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); rej(new Error('queue_timeout')); }, cfg.maxWaitMs) }; waiters.push(w); });
}
function release() { const w = waiters.shift(); if (w) { clearTimeout(w.t); w.res(); } else active--; }

// transport is injectable so tests/load tests can use a local fake Groq
async function transport(model, role, context) {
  const key = process.env.GROQ_API_KEY; const base = process.env.GROQ_BASE_URL || 'https://api.groq.com';
  const res = await fetch(`${base}/openai/v1/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20000),
    body: JSON.stringify({ model, temperature: 0.3, max_tokens: cfg.maxTokens, messages: [{ role: 'system', content: role }, { role: 'user', content: context }] }) });
  if (res.status === 429) { const e = new Error('429'); e.status = 429; e.retryAfter = parseFloat(res.headers.get('retry-after')) || 5; throw e; }
  if (!res.ok) { const e = new Error(`http_${res.status}`); e.status = res.status; throw e; }
  const j = await res.json();
  return { text: j.choices?.[0]?.message?.content || '', tokens: j.usage?.total_tokens };
}
const gate = { transport };

async function call(role, context) {
  const k = TTLCache.key(role, String(context).trim().toLowerCase().replace(/\s+/g, ' '));
  const hit = cache.get(k);
  if (hit !== undefined) { stats.cacheHit++; return hit; }
  if (inflight.has(k)) { stats.deduped++; return inflight.get(k); }
  const p = (async () => {
    const need = estimate(role, context);
    await slot();
    try {
      let lastErr = new Error('no_budget');
      for (const m of cfg.models) {
        const now = Date.now();
        if (!canUse(m, need, now)) { stats.budgetDenied++; continue; }
        charge(m, need, now);
        try {
          const r = await gate.transport(m, role, context);
          refund(m, need, r.tokens || need, Date.now()); sd(m).fails = 0; stats.llm++;
          if (r.text) cache.set(k, r.text);
          return r.text;
        } catch (e) {
          lastErr = e; const s = sd(m);
          if (e.status === 429) { stats.limited429++; s.coolUntil = Date.now() + Math.min(60, e.retryAfter || 5) * 1000; }
          else { stats.errors++; if (++s.fails >= 3) s.openUntil = Date.now() + 30000; }
        }
      }
      throw lastErr;
    } finally { release(); }
  })();
  inflight.set(k, p);
  try { return await p; } catch (e) { stats.fallback++; throw e; } finally { inflight.delete(k); }
}
const snapshot = () => ({ ...stats, active, queued: waiters.length, cacheSize: cache.size, models: Object.fromEntries(Object.keys(LIMITS).map((m) => [m, { tokensLastMin: used(m, Date.now()), requestsToday: sd(m).rpd, tokensToday: sd(m).tpd, coolingDown: Date.now() < sd(m).coolUntil }])) });
const reset = () => { Object.keys(stats).forEach((x) => { stats[x] = 0; }); Object.keys(st).forEach((x) => delete st[x]); cache.map.clear(); };
module.exports = { call, gate, snapshot, reset, cfg, LIMITS, cache };
