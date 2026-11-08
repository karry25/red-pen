// NCERT Exemplar MCQs (official, free, ncert.nic.in). Extra practice, kept apart from the
// "most asked" board-paper list. Checked by exact letter against the official answer key.
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'exemplar.json'), 'utf8'));

const list = (chapterId) => data.chapters[chapterId] || [];
const find = (id) => { for (const c of Object.values(data.chapters)) { const q = c.find((x) => x.id === id); if (q) return q; } return null; };
function pick(chapterId, excludeIds = []) {
  const pool = list(chapterId).filter((q) => !excludeIds.includes(q.id));
  const from = pool.length ? pool : list(chapterId);
  return from.length ? from[Math.floor(Math.random() * from.length)] : null;
}
const publicView = (q) => ({ id: q.id, stem: q.stem, options: q.options, source: q.source });
function check(id, letter) {
  const q = find(id);
  if (!q) return null;
  const l = String(letter || '').trim().toLowerCase().replace(/[()]/g, '')[0];
  if (!['a', 'b', 'c', 'd'].includes(l)) return { valid: false };
  return { valid: true, correct: l === q.answer, answer: q.answer, answerText: q.options[q.answer], source: q.source, key: data.key };
}
function formatQuestion(q) {
  return `Extra practice - ${q.source}\n\n${q.stem}\n(a) ${q.options.a}\n(b) ${q.options.b}\n(c) ${q.options.c}\n(d) ${q.options.d}\n\nReply with a, b, c or d.`;
}
function formatResult(r) {
  if (!r.valid) return 'Please reply with just a, b, c or d.';
  return r.correct ? `Correct - (${r.answer}) ${r.answerText}\n[official key: ${r.source}]` : `Not this time. The official key says (${r.answer}) ${r.answerText}.\nLook at why, then try another with /extra.\n[${r.source}]`;
}
module.exports = { data, list, find, pick, publicView, check, formatQuestion, formatResult };
