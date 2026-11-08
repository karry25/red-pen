// Quick mode: "kal exam hai" style messages get a short plain-text plan + an app link.
const studypath = require('./studypath');
const formulas = require('./formulas');
const PATTERNS = [/\bkal\b.*\bexam\b/i, /\bexam\b.*\bkal\b/i, /\btomorrow\b.*\b(exam|test|paper)\b/i, /\b(exam|test|paper)\b.*\btomorrow\b/i, /\blast[- ]minute\b/i, /\b(aaj raat|tonight)\b.*\b(padh|study|revise)/i, /\b(\d+)\s*(hours?|ghante|ghanta)\b.*\b(exam|left|bacha|baki)/i, /\bquick (plan|revision)\b/i];
const isQuick = (t) => PATTERNS.some((p) => p.test(String(t || '')));

function plan(mem, baseUrl) {
  const p = studypath.buildPath({ days: 1, minutesPerDay: 120, mem });
  const top = p.doFirst.slice(0, 5);
  const link = baseUrl ? `\n\nFull app (quizzes, cards): ${baseUrl}` : '\n\n(App link will be here once Red Pen is deployed.)';
  return `Quick plan, no panic. Do just this, in order:\n${top.map((r, i) => `${i + 1}. Ch.${r.chapter.slice(2)} ${r.name} - 20 min: read the NCERT section ${r.ncert}, then answer one /quiz question on it`).join('\n')}\n6. Last 15 min: read the formula sheet (/formulas) once, then sleep. Rest helps memory.\n\nSkip everything else tonight.${link}`;
}
module.exports = { isQuick, plan };
