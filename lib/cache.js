// Tiny LRU+TTL cache. Values only; keys are hashes, so student text is never stored as a key.
const crypto = require('crypto');
class TTLCache {
  constructor({ max = 500, ttlMs = 24 * 3600 * 1000 } = {}) { this.max = max; this.ttlMs = ttlMs; this.map = new Map(); this.hits = 0; this.misses = 0; }
  static key(...parts) { return crypto.createHash('sha256').update(parts.join('\u0001')).digest('hex'); }
  get(k, now = Date.now()) {
    const e = this.map.get(k);
    if (!e || now - e.at > this.ttlMs) { if (e) this.map.delete(k); this.misses++; return undefined; }
    this.map.delete(k); this.map.set(k, e); this.hits++; return e.v;
  }
  set(k, v, now = Date.now()) { if (this.map.size >= this.max) this.map.delete(this.map.keys().next().value); this.map.set(k, { v, at: now }); }
  get size() { return this.map.size; }
}
module.exports = { TTLCache };
