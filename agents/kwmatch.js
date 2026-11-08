// Keyword matching shared by the grader, doubt matcher and chapter detector.
//  - short keywords (<= 3 chars: "ph", "no", "mg") match whole words only ("photosynthesis" must not match "ph")
//  - multi-word keywords match when every word is present (any order), so "acid metal" matches "metal se acid react"
//  - single words of 6+ letters tolerate one typo ("covelent" ~ "covalent")
//  - longer keywords keep substring matching so student variants (oxidises/oxidised) still match
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const words = (s) => norm(s).split(/[^a-z0-9+]+/).filter(Boolean);
function lev1(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (a.length < b.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}
function match(text, kw, opts = {}) {
  const t = norm(text), k = norm(kw);
  if (!k) return false;
  if (k.length <= 3 || /^[a-z]{1,3}\d?$/.test(k)) return new RegExp(`(^|[^a-z])${k.replace(/[+]/g, '\\+')}([^a-z]|$)`).test(t);
  if (t.includes(k)) return true;
  const kw2 = words(k);
  if (kw2.length > 1 && !opts.strict) { const tw = new Set(words(t)); if (kw2.every((w) => (w.length <= 3 ? tw.has(w) : t.includes(w)))) return true; return false; }
  if (!opts.strict && kw2.length === 1 && k.length >= 6) return words(t).some((w) => w.length >= 5 && lev1(w, k));
  return false;
}
module.exports = { match, norm, words };
