// Finds and ranks YouTube videos for a student's chapter + need + language.
// Free, no API key: reads YouTube's public search page. Honest about evidence:
// ranking uses title, description, creator chapter markers, length and public
// view counts. Likes are not readable here, transcripts are blocked, and no
// video is ever "watched".
const { fetchMeta } = require('./video_meta');
const vc = require('./video_compare');
const { getChapter } = require('./chapter');

const LANGS = {
  english: { label: 'English', q: '', words: [] },
  hindi: { label: 'Hindi', q: 'hindi', q2: 'हिंदी माध्यम', words: ['hindi', 'हिंदी', 'हिन्दी'] },
  hinglish: { label: 'Hinglish', q: 'hinglish', words: ['hinglish'] },
  marathi: { label: 'Marathi', q: 'मराठी', q2: 'marathi medium', words: ['marathi', 'मराठी'] },
};
function parseLang(text) {
  const t = String(text || '').toLowerCase();
  for (const k of ['marathi', 'hinglish', 'hindi', 'english']) if (t.includes(k) || LANGS[k].words.some((w) => t.includes(w))) return k;
  return null;
}
const DEV = /[\u0900-\u097F]/;
// What we can honestly say about a result's language from its TITLE only.
function langSignal(title, wanted) {
  const t = String(title || '').toLowerCase();
  const devanagari = DEV.test(title);
  const named = Object.entries(LANGS).filter(([, l]) => l.words.some((w) => t.includes(w))).map(([k]) => k);
  if (wanted === 'marathi') return named.includes('marathi') ? 'matches (title says Marathi)' : 'unverified';
  if (wanted === 'hindi') return named.includes('hindi') || devanagari ? 'likely (Hindi in title or Devanagari script)' : 'unverified';
  if (wanted === 'hinglish') return named.includes('hinglish') ? 'matches (title says Hinglish)' : (!devanagari ? 'unverified (Latin script, could be English or Hinglish)' : 'unlikely (Devanagari title)');
  if (wanted === 'english') return !devanagari && !named.length ? 'likely (English title)' : 'unlikely (title signals another language)';
  return 'not requested';
}

function parseViews(s) { const n = String(s || '').replace(/[^\d]/g, ''); return n ? Number(n) : null; }
function parseDur(s) { const p = String(s || '').split(':').map(Number); if (!p.length || p.some(Number.isNaN)) return null; return Math.round(p.reduce((a, b) => a * 60 + b, 0) / 60); }

async function ytSearch(query, limit = 12) {
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-IN' }, signal: ctl.signal });
    const h = await r.text();
    const m = h.match(/var ytInitialData = (\{.*?\});<\/script>/s);
    if (!m) return [];
    const out = [];
    (function walk(o) {
      if (Array.isArray(o)) return o.forEach(walk);
      if (!o || typeof o !== 'object') return;
      if (o.videoRenderer && o.videoRenderer.videoId) {
        const v = o.videoRenderer;
        out.push({ id: v.videoId, title: (v.title.runs || []).map((x) => x.text).join(''), channel: (v.ownerText?.runs || []).map((x) => x.text).join(''), minutes: parseDur(v.lengthText?.simpleText), views: parseViews(v.viewCountText?.simpleText) });
      }
      Object.values(o).forEach(walk);
    })(JSON.parse(m[1]));
    return out.filter((x) => /^[A-Za-z0-9_-]{11}$/.test(x.id)).slice(0, limit);
  } catch { return []; } finally { clearTimeout(tm); }
}

async function find({ chapterId, need = '', lang = null, topN = 3 }) {
  const ch = getChapter(chapterId);
  const language = lang && LANGS[lang] ? lang : parseLang(need);
  const needParsed = vc.parseNeed(need, ch.chapterId);
  const topicWords = needParsed.topics.length ? needParsed.topics[0].name : '';
  const q = `class 10 science ${ch.title} ${topicWords} ${language ? LANGS[language].q : ''} ncert`.replace(/\s+/g, ' ').trim();
  let found = await ytSearch(q, 14);
  if (language && LANGS[language].q2) {
    const more = await ytSearch(`class 10 science ${ch.title} ${LANGS[language].q2}`.replace(/\s+/g, ' ').trim(), 14);
    const seen = new Set(found.map((x) => x.id));
    found = [...more.filter((x) => !seen.has(x.id)), ...found]; // language-specific results first
  }
  if (!found.length) return { ok: false, error: 'YouTube search was not reachable just now. Try again in a minute.' };
  let cands = found.filter((v) => v.minutes && v.minutes >= 2 && v.minutes <= 240);
  if (language) cands = cands.filter((v) => !langSignal(v.title, language).startsWith('unlikely'));
  cands = cands.slice(0, 9);
  const rows = [];
  for (const c of cands) {
    const meta = await fetchMeta(c.id);
    if (!meta.ok) continue;
    const a = vc.analyse(meta, ch.chapterId, c.minutes);
    const ns = vc.needScoreFor(a, meta, needParsed);
    const viewSig = c.views ? Math.min(100, Math.round(Math.log10(c.views) * 14)) : 0; // 10k~56, 1M~84
    const ls = langSignal(c.title, language);
    const langScore = !language ? 0 : /^(matches|likely)/.test(ls) ? 100 : 30;
    const total = language ? Math.round(0.75 * ns.total + 0.1 * viewSig + 0.15 * langScore) : Math.round(0.9 * ns.total + 0.1 * viewSig);
    rows.push({ id: c.id, url: `https://www.youtube.com/watch?v=${c.id}`, title: meta.title || c.title, channel: meta.channel || c.channel, minutes: c.minutes, views: c.views, markers: meta.chapters.length, coveredTopics: a.coveredTopics, totalTopics: a.totalTopics, evidence: a.confidence, languageSignal: ls, needScore: ns.total, viewSignal: viewSig, score: total });
  }
  rows.sort((x, y) => y.score - x.score);
  return {
    ok: true, query: q, language: language ? LANGS[language].label : 'not specified', need: { text: need, understood: [...needParsed.criteria.map((c) => c.label), ...needParsed.topics.map((t) => `topic: ${t.name}`)] },
    results: rows.slice(0, topN),
    languageNote: language && !rows.slice(0, topN).some((v) => /^(matches|likely)/.test(v.languageSignal))
      ? `None of the top results has a title that signals ${LANGS[language].label}, so I can not confirm the language. These are the best matches for your need; check the language before you start.` : '',
    method: 'Best = fit to your need (NCERT section coverage, chapter markers, length, exam signals as relevant, 75-90%) + public view count (10%) + language match when you asked for one (15%). Language is judged from the TITLE only, so unverified means I can not tell. Likes are not readable and I cannot read transcripts or watch videos, so treat this as a strong shortlist, not a verdict on teaching quality.',
  };
}

function formatForChat(r) {
  if (!r.ok) return r.error;
  if (!r.results.length) return 'I could not find a usable video for that. Try a simpler need or another language.';
  const lines = r.results.map((v, i) => `${i + 1}. ${v.channel} - ${v.title.slice(0, 60)}\n   ${v.minutes} min, ${v.views ? v.views.toLocaleString('en-IN') + ' views' : 'views unknown'}, ${v.coveredTopics}/${v.totalTopics} NCERT sections, ${v.markers} chapter markers (evidence ${v.evidence})\n   language: ${v.languageSignal}; fit score ${v.score}/100\n   ${v.url}`);
  return `Language: ${r.language}. You need: ${r.need.understood.join(' + ') || 'not specified (balanced default)'}\n\n${lines.join('\n\n')}\n\n${r.languageNote ? '\n\nNote: ' + r.languageNote : ''}\n\n${r.method}`;
}
module.exports = { find, formatForChat, parseLang, langSignal, ytSearch };
