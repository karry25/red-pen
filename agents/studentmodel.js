// The student model: what Red Pen remembers about HOW this student learns,
// derived only from the opt-in memory file (agents/memory.js - no messages, no name).
//  - Always-on transparency: /model shows exactly what is known and what it changes.
//  - Controls stay with the student: /remember off stops it, /forget wipes it.
//  - Everything here is a no-op when memory is off.
const memory = require('./memory');

// What the agent knows, in plain words. Behaviour-focused companion to /mydata.
function describe(chatId) {
  const rec = memory.get(chatId);
  if (!rec) return 'Student model: OFF. I am not remembering anything about how you learn. (/remember on turns it on; /forget deletes it.)';
  const weak = Object.entries(rec.weak || {}).sort((a, b) => b[1] - a[1]);
  const repeats = repeatMisses(rec);
  const lines = ['What I remember about how you learn (all from /remember on):'];
  lines.push(`- Language for videos: ${rec.lang || 'not set yet'}`);
  lines.push(`- Chapter you are on: ${rec.chapter || 'not set yet'}`);
  lines.push(`- Questions you have found hard: ${weak.length ? weak.slice(0, 6).map(([k, v]) => `${k}${v > 1 ? ` (x${v})` : ''}`).join(', ') : 'none yet'}`);
  lines.push(`- Points you have missed more than once: ${repeats.length ? repeats.map((r) => `${r.questionId} point ${r.point + 1} (x${r.count})`).join(', ') : 'none yet'}`);
  lines.push('');
  lines.push('What that changes, automatically:');
  lines.push('- /quiz brings back questions you found hard, mixed with new ones');
  lines.push('- when you miss the same point twice, I say so kindly and it stays on your revision list');
  lines.push('- your reminders (/drip) include your hard questions');
  lines.push('- your study path (/path) works on your weak spots first');
  lines.push('');
  lines.push('You are in charge: /remember off stops new memories, /forget deletes everything.');
  return lines.join('\n');
}

// Points missed 2+ times for the same question - the pattern a teacher would notice.
function repeatMisses(rec) {
  const out = [];
  for (const [qid, pts] of Object.entries(rec.missed || {})) {
    for (const [idx, count] of Object.entries(pts)) {
      if (count >= 2) out.push({ questionId: qid, point: Number(idx), count });
    }
  }
  return out.sort((a, b) => b.count - a.count).slice(0, 8);
}

// Quiz weighting: questions the student found hard come back first (half the time),
// like a teacher re-testing exactly what was missed.
function weightQuiz(chatId, pool) {
  const rec = memory.get(chatId);
  if (!rec || !pool.length) return null;
  const weakInPool = pool.filter((q) => rec.weak && rec.weak[q.id]);
  if (weakInPool.length && Math.random() < 0.5) return weakInPool[Math.floor(Math.random() * weakInPool.length)];
  return null;
}

// Kind feedback when the same point is missed again. Returns '' when nothing to say.
function repeatNote(chatId, questionId, missingIndexes) {
  const rec = memory.get(chatId);
  if (!rec || !rec.missed || !rec.missed[questionId]) return '';
  const again = missingIndexes.filter((i) => (rec.missed[questionId][i] || 0) >= 1);
  if (!again.length) return '';
  return '\n\nYou missed this exact point last time too - no worries, it just means it needs one more look. It stays on your revision list.';
}

module.exports = { describe, repeatMisses, weightQuiz, repeatNote };
