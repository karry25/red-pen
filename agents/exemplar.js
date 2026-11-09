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
// Written-answer practice: official Exemplar short-answer questions, checked point by point
// against what the official NCERT model answer contains (keyword match - honest about limits).
const kwm = require('./kwmatch');
const shortData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'exemplar_short.json'), 'utf8'));
const shortList = (chapterId) => shortData.chapters[chapterId] || [];
const shortFind = (id) => { for (const c of Object.values(shortData.chapters)) { const q = c.find((x) => x.id === id); if (q) return q; } return null; };
function shortPick(chapterId, excludeIds = []) {
  const pool = shortList(chapterId).filter((q) => !excludeIds.includes(q.id));
  const from = pool.length ? pool : shortList(chapterId);
  return from.length ? from[Math.floor(Math.random() * from.length)] : null;
}
const shortPublicView = (q) => ({ id: q.id, n: q.n, question: q.question, source: q.source });
function shortGrade(id, text) {
  const q = shortFind(id);
  if (!q) return null;
  const t = String(text || '').trim();
  if (t.length < 3) return { tooShort: true };
  const points = q.points.map((p) => ({ text: p.t, status: p.k.some((k) => kwm.match(t, k)) ? 'hit' : 'missing' }));
  const score = points.filter((p) => p.status === 'hit').length;
  return { score, maxScore: points.length, points, answer: q.answer, source: q.source, key: shortData.key, answerNote: shortData.answerNote };
}
function shortFormatQuestion(q) {
  return `Written practice - NCERT Exemplar Ch. Q.${q.n} (short answer)\n\n${q.question}\n\nWrite your answer in your own words. I'll check it point by point against the official NCERT model answer.`;
}
function shortFormatResult(r) {
  if (r.tooShort) return 'That answer is very short - write a sentence or two and I can check it properly.';
  const got = r.points.filter((p) => p.status === 'hit').map((p) => `  [x] ${p.text}`);
  const missed = r.points.filter((p) => p.status === 'missing').map((p) => `  [ ] ${p.text}`);
  return `You got ${r.score}/${r.maxScore} points from the official answer.\n${got.join('\n')}${missed.length ? '\nMissing:\n' + missed.join('\n') : ''}\n\nOfficial NCERT answer:\n${r.answer}\n\n[${r.source}]`;
}
const short = { data: shortData, list: shortList, find: shortFind, pick: shortPick, publicView: shortPublicView, grade: shortGrade, formatQuestion: shortFormatQuestion, formatResult: shortFormatResult };
module.exports = { data, list, find, pick, publicView, check, formatQuestion, formatResult, short };
