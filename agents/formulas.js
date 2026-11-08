// Formula/equation cards + mnemonics. Facts come from data/formulas.json (each cites an NCERT section).
// Mnemonics are Red Pen memory aids, labelled as such. Dunlosky et al. 2013 rate keyword mnemonics
// low-utility, so the sheet tells students to self-test rather than just reread.
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'formulas.json'), 'utf8'));

const forChapter = (chapterId) => data.items.filter((i) => i.chapter === chapterId);
const byId = (id) => data.items.find((i) => i.id === id) || null;

function formatSheet(chapterId, title) {
  const items = forChapter(chapterId);
  if (!items.length) return `No formula sheet for ${chapterId} yet.`;
  const lines = items.map((i) => `* ${i.title}\n  ${i.body}${i.mnemonic ? `\n  Memory aid (mine, not NCERT): ${i.mnemonic}` : ''}\n  [${i.ncert}]`);
  return `${title} - formulas and key equations\n\n${lines.join('\n\n')}\n\nTip: cover the right side and try to write each one from memory. Self-testing beats rereading (Roediger & Karpicke 2006). Mnemonics only help a little (Dunlosky et al. 2013), so use them for lists like the reactivity series, not for understanding.`;
}
module.exports = { data, forChapter, byId, formatSheet };
