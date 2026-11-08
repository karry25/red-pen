// Opt-in per-student memory. Minimal by design:
//  - Only for chats that sent /remember on. Everything else is a no-op.
//  - Stores NO message text, names, or voice: only chapter/topic ids, counts,
//    question ids the student found hard, language and need *keys*.
//  - File name = salted SHA-256 of the chat id; a chat can only ever open its
//    own file (the path is computed from the caller's own chat id, never from
//    user text). Files are mode 0600 and live outside /public.
//  - /forget (and /remember off) deletes the file. Idle files expire after 90 days.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIR = process.env.REDPEN_STORE || path.join(__dirname, '..', 'data', 'store');
const TTL_MS = 90 * 24 * 60 * 60 * 1000;
const NEED_KEYS = new Set(['fast', 'exam', 'full', 'concept']);
const LANGS = new Set(['english', 'hindi', 'hinglish', 'marathi']);
const ID_RE = /^[a-z0-9-]{1,40}$/i;

function ensureDir() { fs.mkdirSync(DIR, { recursive: true, mode: 0o700 }); }
function salt() {
  if (process.env.REDPEN_SALT) return process.env.REDPEN_SALT;
  ensureDir();
  const f = path.join(DIR, '.salt');
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  return fs.readFileSync(f, 'utf8');
}
function fileFor(chatId) {
  const h = crypto.createHash('sha256').update(`${salt()}:${String(chatId)}`).digest('hex');
  return path.join(DIR, `${h}.json`);
}
function read(chatId) {
  const f = fileFor(chatId);
  try {
    const rec = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (Date.now() - (rec.lastUsed || 0) > TTL_MS) { fs.rmSync(f, { force: true }); return null; }
    return rec;
  } catch { return null; }
}
function write(chatId, rec) {
  ensureDir();
  rec.lastUsed = Date.now();
  const f = fileFor(chatId);
  const tmp = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(rec), { mode: 0o600 });
  fs.renameSync(tmp, f);
}
const bump = (obj, key, cap) => {
  if (!(key in obj) && Object.keys(obj).length >= cap) return;
  obj[key] = Math.min(999, (obj[key] || 0) + 1);
};

const enable = (chatId) => { if (!read(chatId)) write(chatId, { v: 1, createdAt: Date.now(), topics: {}, weak: {}, needs: {}, lang: null, chapter: null }); };
const forget = (chatId) => { fs.rmSync(fileFor(chatId), { force: true }); };
const isOn = (chatId) => !!read(chatId);
const get = (chatId) => read(chatId);

// event types are a closed set; values are validated, never free text
function record(chatId, ev) {
  const rec = read(chatId);
  if (!rec) return false;
  switch (ev.type) {
    case 'topic':
      if (/^ch[1-9]$/.test(ev.chapter) && ID_RE.test(String(ev.topic || ''))) bump(rec.topics, `${ev.chapter}:${ev.topic}`, 60);
      break;
    case 'weak':
      if (ID_RE.test(String(ev.questionId || ''))) bump(rec.weak, ev.questionId, 40);
      break;
    case 'strong':
      delete rec.weak[ev.questionId];
      break;
    case 'lang':
      if (LANGS.has(ev.lang)) rec.lang = ev.lang;
      break;
    case 'chapter':
      if (/^ch[1-9]$/.test(ev.chapter)) rec.chapter = ev.chapter;
      break;
    case 'need':
      (ev.keys || []).filter((k) => NEED_KEYS.has(k)).forEach((k) => bump(rec.needs, k, 8));
      break;
    default: return false;
  }
  write(chatId, rec);
  return true;
}

function summaryText(chatId) {
  const rec = read(chatId);
  if (!rec) return 'Memory is OFF - I have nothing saved about you. (/remember on to turn it on.)';
  const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);
  const days = Math.max(0, Math.round((TTL_MS - (Date.now() - rec.lastUsed)) / 86400000));
  return [
    'This is everything I have saved about you (no messages, no name):',
    `- Language for videos: ${rec.lang || 'not set'}`,
    `- Last chapter: ${rec.chapter || 'not set'}`,
    `- Topics you asked about: ${top(rec.topics, 8).map(([k, v]) => `${k} x${v}`).join(', ') || 'none yet'}`,
    `- Questions you found hard: ${top(rec.weak, 8).map(([k, v]) => `${k} x${v}`).join(', ') || 'none yet'}`,
    `- What you usually need: ${top(rec.needs, 4).map(([k, v]) => `${k} x${v}`).join(', ') || 'none yet'}`,
    rec.drip && rec.drip.on ? `- Formula reminders: ON${rec.drip.paused ? ' (paused)' : ''} - to send them I also keep your Telegram chat id in this file and the formula ids with next-due dates.` : '- Formula reminders: off',
    `Auto-deleted after 90 days of not using me (about ${days} days left). /forget deletes it right now.`,
    'Heads-up: on the free host this file can disappear if the server restarts.',
  ].join('\n');
}

function sweep() {
  let n = 0;
  try {
    for (const f of fs.readdirSync(DIR)) {
      if (!/^[0-9a-f]{64}\.json$/.test(f)) continue;
      try {
        const rec = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
        if (Date.now() - (rec.lastUsed || 0) > TTL_MS) { fs.rmSync(path.join(DIR, f), { force: true }); n++; }
      } catch { fs.rmSync(path.join(DIR, f), { force: true }); n++; }
    }
  } catch { /* no dir yet */ }
  return n;
}
const readRec = read, writeRec = write;
module.exports = { readRec, writeRec, enable, forget, isOn, get, record, summaryText, sweep, fileFor, TTL_MS, DIR };
