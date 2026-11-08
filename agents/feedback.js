// Anonymous answer ratings (thumbs up/down). Stores only counts per answer key: no student id, no text.
// One rating per (student, answer) is enforced in memory only (hash of chat+answer, never written to disk),
// so a student can't spam the score. Low-rated answers are surfaced to the teacher view so they can be fixed.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const FILE = process.env.REDPEN_FEEDBACK || path.join(process.env.REDPEN_STORE || path.join(__dirname, '..', 'data', 'store'), 'feedback.json');
const KEY_RE = /^[a-z0-9:_.-]{1,80}$/i;
let counts = null; const voted = new Set();
function load() { if (counts) return counts; try { counts = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { counts = {}; } return counts; }
function save() { try { fs.mkdirSync(path.dirname(FILE), { recursive: true, mode: 0o700 }); fs.writeFileSync(FILE, JSON.stringify(counts), { mode: 0o600 }); } catch { /* best effort on read-only disks */ } }
const voterKey = (who, key) => crypto.createHash('sha256').update(`${who}|${key}`).digest('hex');

function rate(who, key, value) {
  if (!KEY_RE.test(String(key || ''))) return { ok: false, why: 'bad_key' };
  if (value !== 'up' && value !== 'down') return { ok: false, why: 'bad_value' };
  const c = load(); const vk = voterKey(who, key);
  if (voted.has(vk)) return { ok: false, why: 'already_rated' };
  if (!c[key] && Object.keys(c).length >= 2000) return { ok: false, why: 'full' };
  voted.add(vk); if (voted.size > 20000) voted.delete(voted.values().next().value);
  const r = (c[key] = c[key] || { up: 0, down: 0 }); r[value] += 1; save();
  return { ok: true };
}
// answers with at least `min` ratings and a down-share >= 40%
function needsReview(min = 5) {
  const c = load();
  return Object.entries(c).filter(([, v]) => v.up + v.down >= min && v.down / (v.up + v.down) >= 0.4).map(([key, v]) => ({ key, ...v })).sort((a, b) => b.down - a.down);
}
const summary = () => { const c = load(); return { answersRated: Object.keys(c).length, up: Object.values(c).reduce((a, v) => a + v.up, 0), down: Object.values(c).reduce((a, v) => a + v.down, 0), needsReview: needsReview() }; };
const reset = () => { counts = {}; voted.clear(); };
module.exports = { rate, needsReview, summary, reset };
