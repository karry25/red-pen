// Personalised study path - rule-based (works with no AI key). Not forced: it ranks, then
// says plainly what is safe to leave for later. No learning-style personalisation (Pashler 2008);
// it uses what the student actually found hard + past-paper evidence + time available.
const { getChapter } = require('./chapter');
const topics = require('../data/coverage_topics.json');
const CHAPTERS = ['ch1', 'ch2', 'ch3', 'ch4'];
const MIN_PER_TOPIC = 20;

const norm = (s) => String(s || '').toLowerCase();
const hits = (text, words) => words.some((w) => norm(text).includes(w));

function buildPath({ days = 7, minutesPerDay = 60, mem = null } = {}) {
  const budget = Math.max(1, Math.min(30, days)) * Math.max(20, Math.min(240, minutesPerDay));
  const rows = [];
  for (const cid of CHAPTERS) {
    const ch = getChapter(cid);
    const all = [...ch.pack.questions, ...ch.pack.pyqs];
    for (const t of topics[cid]) {
      let score = 1, why = [];
      const rep = ch.pack.pyqs.filter((q) => q.repeated && hits(q.text, t.words)).length;
      if (rep) { score += 2 * rep; why.push('asked again in both sample-paper years'); }
      const pq = ch.pack.pyqs.filter((q) => hits(q.text, t.words)).length;
      if (pq && !rep) { score += pq; why.push('appears in a CBSE sample paper'); }
      if (mem) {
        const weak = all.filter((q) => mem.weak && mem.weak[q.id] && hits(q.text, t.words)).length;
        if (weak) { score += 6 * weak; why.push('you found a question on this hard'); }
        const asked = Object.entries(mem.topics || {}).filter(([k]) => k.startsWith(cid + ':') && hits(k.split(':')[1].replace(/-/g, ' '), t.words)).reduce((s, [, v]) => s + v, 0);
        if (asked) { score += Math.min(2, asked); why.push('you asked doubts on it'); }
      }
      rows.push({ chapter: cid, id: t.id, name: t.name, ncert: t.ncert, score, why });
    }
  }
  rows.sort((a, b) => b.score - a.score);
  const n = Math.max(1, Math.floor(budget / MIN_PER_TOPIC));
  const doFirst = rows.slice(0, n);
  const later = rows.slice(n).filter((r) => r.why.length);
  const skip = rows.slice(n).filter((r) => !r.why.length);
  return { budgetMinutes: budget, minutesPerTopic: MIN_PER_TOPIC, doFirst, later, skip, personalised: !!(mem && (Object.keys(mem.weak || {}).length || Object.keys(mem.topics || {}).length)) };
}

function format(p) {
  const l = (r) => `- Ch.${r.chapter.slice(2)} ${r.name} (${r.ncert})${r.why.length ? ' - ' + r.why.join('; ') : ''}`;
  return [
    `Your study path (about ${p.budgetMinutes} min total, ~${p.minutesPerTopic} min per topic).`,
    p.personalised ? 'Built from the questions you found hard and topics you asked about.' : 'Built from past-paper evidence only. Turn on /remember and it adapts to what you find hard.',
    '', 'Do first:', ...p.doFirst.map(l),
    ...(p.later.length ? ['', 'If time is left:', ...p.later.slice(0, 6).map(l)] : []),
    ...(p.skip.length ? ['', `Fine to leave for now (nothing points at them): ${p.skip.map((r) => r.name).join('; ')}`] : []),
    '', 'This is a suggestion, not a rule. If you already know a topic, skip it. Practice questions (/quiz) work better than rereading.',
  ].join('\n');
}
module.exports = { buildPath, format };
