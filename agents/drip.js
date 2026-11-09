// Opt-in spaced formula reminders. Kind by design:
//  - starts only on /drip on (needs /remember-style file; stores chat id ONLY for this)
//  - spacing 1/3/7/14 days (Cepeda et al. 2006; Pashler 2008 notes spacing helps), max 2 per day
//  - quiet hours 22:00-07:00 IST, never sent
//  - no streaks, no guilt text; missed days are simply ignored (no catch-up flood)
//  - prompt first, answer behind a button (testing effect, Roediger & Karpicke 2006)
//  - /pause, /stop (deletes the reminder data) at any time
const memory = require('./memory');
const formulas = require('./formulas');
const { getChapter } = require('./chapter');
// Lazy require: exemplar pulls in its data files only when a weak written question needs it.
const exemplarShort = () => require('./exemplar').short;

const GAPS_DAYS = [1, 3, 7, 14];
const MAX_PER_DAY = 2;
const DAY = 86400000;
const IST = 5.5 * 3600000;
const istHour = (now) => new Date(now + IST).getUTCHours();
const istDay = (now) => new Date(now + IST).toISOString().slice(0, 10);
const quiet = (now) => { const h = istHour(now); return h >= 22 || h < 7; };

// One place that turns a deck item id into its recall card. Question items
// (q:<questionId>) come from the student's own weak list; the rest are
// chapter formula cards. Used by dueFor and by the Telegram Show button.
function cardFor(chapterId, id) {
  if (id.startsWith('q:')) {
    const qid = id.slice(2);
    const q = getChapter(chapterId || 'ch1').allQuestions().find((x) => x.id === qid);
    if (q) return { prompt: `You found this one hard last time - try it again from memory, no pressure:\n${q.text}`, answer: `Marking points:\n${(q.points || []).map((p) => '- ' + p.text).join('\n')}` };
    const x = exemplarShort().find(qid);
    return x ? { prompt: `You found this written question hard last time - try it again from memory, no pressure:\n${x.question}`, answer: `Official NCERT answer:\n${x.answer}` } : null;
  }
  const f = formulas.byId(id);
  return f ? { prompt: `Quick recall (no pressure): can you write "${f.title}" from memory? Think first, then tap Show.`, answer: `${f.title}\n${f.body}\n[${f.ncert}]` } : null;
}

// Personalisation: questions the student found hard (their opt-in weak list)
// join the deck as their own recall cards, ahead of the general formula cards.
// The agent notices; the student does not have to ask.
function seedWeakQuestions(rec, items, chapterId, now) {
  const weakIds = rec.weak ? Object.keys(rec.weak) : [];
  if (!weakIds.length) return 0;
  const ch = getChapter(chapterId);
  let slot = 0;
  for (const qid of weakIds) {
    if (ch.allQuestions().some((x) => x.id === qid) || exemplarShort().find(qid)) items['q:' + qid] = { stage: 0, due: now + DAY + Math.floor(slot++ / 2) * DAY };
  }
  return slot;
}

// Called when a weak/strong event lands while reminders are on: a new weak
// question joins the deck (due tomorrow); a mastered one leaves it.
function addWeak(chatId, qid, now = Date.now()) {
  const r = memory.readRec(chatId);
  if (!r || !r.drip || !r.drip.on || r.drip.items['q:' + qid]) return false;
  const ch = getChapter(r.drip.chapterId || 'ch1');
  if (!ch.allQuestions().some((x) => x.id === qid) && !exemplarShort().find(qid)) return false;
  r.drip.items['q:' + qid] = { stage: 0, due: now + DAY };
  memory.writeRec(chatId, r);
  return true;
}
function dropWeak(chatId, qid) {
  const r = memory.readRec(chatId);
  if (!r || !r.drip || !r.drip.items['q:' + qid]) return false;
  delete r.drip.items['q:' + qid];
  memory.writeRec(chatId, r);
  return true;
}

function start(chatId, chapterId, now = Date.now()) {
  memory.enable(chatId);
  const rec = memory.readRec(chatId);
  const items = {};
  const weakSeeded = seedWeakQuestions(rec, items, chapterId, now);
  formulas.forChapter(chapterId).forEach((f, i) => { items[f.id] = { stage: 0, due: now + DAY + Math.floor((i + weakSeeded) / 2) * DAY }; });
  rec.drip = { on: true, chatId, chapterId, paused: false, items, day: istDay(now), sent: 0 };
  memory.writeRec(chatId, rec);
  return Object.keys(items).length;
}
const stop = (chatId) => { const r = memory.readRec(chatId); if (r) { delete r.drip; memory.writeRec(chatId, r); } };
function setPaused(chatId, paused) { const r = memory.readRec(chatId); if (!r || !r.drip) return false; r.drip.paused = paused; memory.writeRec(chatId, r); return true; }
const state = (chatId) => { const r = memory.readRec(chatId); return r && r.drip ? r.drip : null; };

// Returns up to MAX_PER_DAY prompts for this chat that are due now (and marks them sent).
function dueFor(chatId, now = Date.now()) {
  const r = memory.readRec(chatId);
  if (!r || !r.drip || !r.drip.on || r.drip.paused || quiet(now)) return [];
  const d = r.drip;
  if (d.day !== istDay(now)) { d.day = istDay(now); d.sent = 0; }
  const out = [];
  const due = Object.entries(d.items).filter(([, v]) => v.due <= now).sort((a, b) => (b[0].startsWith('q:') ? 1 : 0) - (a[0].startsWith('q:') ? 1 : 0) || a[1].due - b[1].due);
  for (const [id, v] of due) {
    if (d.sent >= MAX_PER_DAY) break;
    const card = cardFor(d.chapterId, id);
    if (!card) { delete d.items[id]; continue; }
    d.sent += 1;
    v.stage += 1;
    if (v.stage > GAPS_DAYS.length) delete d.items[id]; else v.due = now + GAPS_DAYS[v.stage - 1] * DAY;
    out.push({ id, prompt: card.prompt, answer: card.answer });
  }
  memory.writeRec(chatId, r);
  return out;
}
// chat ids of students with reminders on, read from their own opt-in files
function activeChats() {
  const fs = require('fs'); const out = [];
  try {
    for (const f of fs.readdirSync(memory.DIR)) {
      if (!/^[0-9a-f]{64}\.json$/.test(f)) continue;
      try { const r = JSON.parse(fs.readFileSync(require('path').join(memory.DIR, f), 'utf8')); if (r.drip && r.drip.on && r.drip.chatId !== undefined) out.push(r.drip.chatId); } catch { /* skip */ }
    }
  } catch { /* no store yet */ }
  return out;
}
module.exports = { activeChats, start, stop, setPaused, state, dueFor, quiet, cardFor, addWeak, dropWeak, GAPS_DAYS, MAX_PER_DAY };
