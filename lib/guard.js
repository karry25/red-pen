// Web guard: per-client rate limits, daily caps for expensive routes, security headers.
const { Limiter, DailyCap } = require('./limits');
const HEAVY = new Set(['/api/grade', '/api/doubt', '/api/teach', '/api/triage/plan', '/api/compare', '/api/videos/find']);
const heavy = new Limiter({ rate: 0.1, burst: 6 });          // ~6 per minute after the first burst
const heavyDay = new DailyCap({ max: 150 });
const light = new Limiter({ rate: 1, burst: 60 });
const stat = new Limiter({ rate: 5, burst: 120 });
const global = new Limiter({ rate: Number(process.env.GLOBAL_RPS || 150), burst: Number(process.env.GLOBAL_BURST || 300), maxKeys: 1 });
const counters = { allowed: 0, limited: 0, limitedHeavy: 0, limitedDaily: 0, limitedGlobal: 0 };

// Behind a proxy (Render) the real client is the LAST address the proxy appended to X-Forwarded-For.
function clientKey(req) {
  if (process.env.TRUST_PROXY === '1') {
    const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (xff.length) return xff[xff.length - 1].slice(0, 64);
  }
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}
function headers(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: https://i.ytimg.com; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
}
function reject(res, code, msg, retry) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': String(retry || 5), 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ error: msg, retryAfterSec: retry || 5 }));
}
// returns true when the request was rejected (response already sent)
function guard(req, res, pathname, now = Date.now()) {
  headers(res);
  if (pathname === '/healthz' || process.env.RATE_LIMITS === 'off') return false; // 'off' is for the regression test only
  const g = global.take('all', now);
  if (!g.ok) { counters.limitedGlobal++; counters.limited++; reject(res, 503, 'Busy right now - please try again in a few seconds.', g.retryAfterSec); return true; }
  const key = clientKey(req);
  const isApi = pathname.startsWith('/api/');
  if (HEAVY.has(pathname)) {
    const h = heavy.take(key, now);
    if (!h.ok) { counters.limitedHeavy++; counters.limited++; reject(res, 429, 'You are going a bit fast - this needs a short breather. Try again soon.', h.retryAfterSec); return true; }
    if (!heavyDay.take(key, now)) { counters.limitedDaily++; counters.limited++; reject(res, 429, 'Daily limit for this feature reached on this connection. It resets at midnight IST. The rest of the app still works.', 3600); return true; }
  } else {
    const l = (isApi ? light : stat).take(key, now);
    if (!l.ok) { counters.limited++; reject(res, 429, 'Too many requests - slow down a little.', l.retryAfterSec); return true; }
  }
  counters.allowed++;
  return false;
}
module.exports = { guard, clientKey, counters, HEAVY };
