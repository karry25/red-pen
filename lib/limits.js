// Small, dependency-free rate limiter: token buckets per key with a hard cap on how many keys
// are tracked (oldest evicted), so an attacker cannot grow memory by inventing identities.
class Limiter {
  // rate = tokens refilled per second, burst = bucket size, maxKeys = memory cap
  constructor({ rate, burst, maxKeys = 5000 }) { this.rate = rate; this.burst = burst; this.maxKeys = maxKeys; this.map = new Map(); }
  take(key, now = Date.now(), cost = 1) {
    let b = this.map.get(key);
    if (!b) { b = { t: this.burst, at: now }; if (this.map.size >= this.maxKeys) this.map.delete(this.map.keys().next().value); }
    else this.map.delete(key); // re-insert = most recently used
    b.t = Math.min(this.burst, b.t + ((now - b.at) / 1000) * this.rate); b.at = now;
    const ok = b.t >= cost;
    if (ok) b.t -= cost;
    this.map.set(key, b);
    return { ok, retryAfterSec: ok ? 0 : Math.ceil((cost - b.t) / this.rate) };
  }
}
// Fixed daily allowance per key (e.g. LLM-backed requests per student per day); same memory cap.
class DailyCap {
  constructor({ max, maxKeys = 5000 }) { this.max = max; this.maxKeys = maxKeys; this.map = new Map(); }
  day(now) { return new Date(now + 5.5 * 3600000).toISOString().slice(0, 10); }
  take(key, now = Date.now()) {
    const d = this.day(now); let r = this.map.get(key);
    if (!r || r.d !== d) { r = { d, n: 0 }; if (!this.map.has(key) && this.map.size >= this.maxKeys) this.map.delete(this.map.keys().next().value); }
    if (r.n >= this.max) return false;
    r.n += 1; this.map.set(key, r); return true;
  }
}
module.exports = { Limiter, DailyCap };
