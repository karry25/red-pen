// Video comparison agent. Honest by design:
//  - Reads title, description and creator chapter markers only (no transcripts:
//    YouTube blocks them from servers). It never says it "watched" a video.
//  - Coverage = which NCERT sections of the chapter the markers/description
//    mention, and (when markers exist) how many minutes each gets.
//  - Confidence: HIGH only with >=5 markers AND a known length; MEDIUM with
//    markers; LOW when judged from title/description alone.
const fs = require('fs');
const path = require('path');
const { fetchMeta } = require('./video_meta');
const TOPICS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'coverage_topics.json'), 'utf8'));
let CACHE = null;
function cached(id) {
  try {
    if (!CACHE) CACHE = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'videos.json'), 'utf8'));
    for (const ts of Object.values(CACHE.chapters)) for (const t of ts) for (const v of t.videos) if (v.id === id) return v;
  } catch { /* none */ }
  return null;
}

const has = (text, words) => words.some((w) => text.includes(w));

function analyse(meta, chapterId, knownMinutes) {
  const topics = TOPICS[chapterId];
  const lengthSec = knownMinutes ? knownMinutes * 60 : null;
  const markers = meta.chapters || [];
  const perTopic = topics.map((t) => ({ id: t.id, name: t.name, ncert: t.ncert, minutes: 0, mentioned: false, via: null }));
  // 1) markers: each marker owns the time until the next marker
  markers.forEach((m, i) => {
    const end = i + 1 < markers.length ? markers[i + 1].start : lengthSec;
    const mins = end != null ? Math.max(0, (end - m.start) / 60) : 0;
    const text = m.title.toLowerCase();
    topics.forEach((t, k) => {
      if (has(text, t.words)) { perTopic[k].minutes += mins; perTopic[k].mentioned = true; perTopic[k].via = 'chapter markers'; }
    });
  });
  // 2) description + title (weaker evidence): mentions only, no minutes
  const blob = `${meta.title || ''} ${meta.description || ''}`.toLowerCase();
  topics.forEach((t, k) => {
    if (!perTopic[k].mentioned && has(blob, t.words)) { perTopic[k].mentioned = true; perTopic[k].via = 'title/description'; }
  });
  const covered = perTopic.filter((p) => p.mentioned).length;
  const fromMarkers = perTopic.filter((p) => p.via === 'chapter markers').length;
  const exam = TOPICS.examSignals.filter((w) => blob.includes(w) || markers.some((m) => m.title.toLowerCase().includes(w)));
  const confidence = markers.length >= 5 && lengthSec ? 'HIGH' : markers.length >= 3 ? 'MEDIUM' : 'LOW';
  return {
    id: meta.id, title: meta.title, channel: meta.channel, minutes: knownMinutes || null,
    markerCount: markers.length, coveredTopics: covered, totalTopics: topics.length, coveredByMarkers: fromMarkers,
    coveragePct: Math.round((covered / topics.length) * 100), perTopic, examSignals: exam, confidence,
    notes: meta.notes || [],
  };
}

// ---- need parsing: the student's own words decide the ranking -------------
const NEEDS = [
  { key: 'fast', label: 'fastest revision', words: ['quick', 'fast', 'jaldi', 'short', 'last minute', 'last-minute', 'revision', 'revise', 'less time', 'kam time', 'kal exam', 'tomorrow', 'in a hurry', 'minutes'] },
  { key: 'exam', label: 'exam answers', words: ['exam', 'board', 'pyq', 'previous year', 'marks', 'answer writing', 'answers', 'question', 'paper', 'scoring'] },
  { key: 'full', label: 'full syllabus', words: ['full', 'complete', 'whole', 'entire', 'detailed', 'in depth', 'in-depth', 'poora', 'pura', 'all topics', 'syllabus'] },
  { key: 'concept', label: 'clear concepts', words: ['concept', 'understand', 'basics', 'basic', 'beginner', 'samajh', 'clear', 'explain', 'from scratch', 'intuition'] },
];
const UNVERIFIABLE = [['hindi', 'language'], ['english', 'language'], ['marathi', 'language'], ['hinglish', 'language'], ['teacher', 'teaching style'], ['voice', 'teaching style'], ['animation', 'visual style'], ['funny', 'teaching style']];

function parseNeed(text, chapterId) {
  const t = String(text || '').toLowerCase();
  const found = NEEDS.filter((n) => n.words.some((w) => t.includes(w)));
  const topic = (TOPICS[chapterId] || []).filter((tp) => tp.words.some((w) => t.includes(w.trim())) || t.includes(tp.name.toLowerCase().split(' ')[0]) && tp.name.toLowerCase().split(' ')[0].length > 5);
  const cannot = UNVERIFIABLE.filter(([w]) => t.includes(w)).map(([w, k]) => `${w} (${k})`);
  return { text: String(text || '').slice(0, 200), criteria: found, topics: topic.slice(0, 3), cannotJudge: cannot };
}

const QSIGNS = ['question', 'exercise', 'pyq', 'previous year', 'board', 'practice', 'important', 'numerical', 'exam'];
function critScore(key, a, meta, need) {
  const mk = (meta.chapters || []).map((c) => c.title.toLowerCase());
  if (key === 'full') return Math.round(100 * a.coveredTopics / a.totalTopics);
  if (key === 'exam') {
    const q = mk.filter((t) => QSIGNS.some((w) => t.includes(w))).length;
    return Math.min(100, Math.round(50 * Math.min(1, a.examSignals.length / 3) + 30 * Math.min(1, q / 2) + 20 * (a.coveredTopics / a.totalTopics)));
  }
  if (key === 'fast') {
    const mins = a.minutes || (meta.lastMarkerSec ? meta.lastMarkerSec / 60 : null);
    if (!mins) return null; // cannot judge length
    const per = (a.coveredTopics / a.totalTopics) * 100 / Math.max(5, mins); // coverage points per minute
    return Math.min(100, Math.round(per * 20));
  }
  if (key === 'concept') {
    const c = mk.filter((t) => ['intro', 'concept', 'basic', 'definition', 'example', 'activity', 'what is', 'why'].some((w) => t.includes(w))).length;
    return Math.min(100, Math.round(60 * Math.min(1, c / 3) + 40 * (a.coveredTopics / a.totalTopics)));
  }
  return null;
}
function topicScore(a, topics) {
  if (!topics.length) return null;
  const rows = a.perTopic.filter((p) => topics.some((t) => t.id === p.id));
  const hit = rows.filter((p) => p.mentioned).length / rows.length;
  const mins = rows.reduce((s, p) => s + p.minutes, 0);
  return Math.min(100, Math.round(70 * hit + 30 * Math.min(1, mins / 8)));
}
function needScore(a, meta, need) {
  const parts = []; // [{label, value|null}]
  for (const c of need.criteria) parts.push({ label: c.label, value: critScore(c.key, a, meta, need) });
  if (need.topics.length) parts.push({ label: `topic: ${need.topics.map((t) => t.name).join(' / ')}`, value: topicScore(a, need.topics) });
  if (!parts.length) { // no recognised need: balanced default, said out loud
    parts.push({ label: 'balanced default', value: Math.round(70 * (a.coveredTopics / a.totalTopics) + 20 * Math.min(1, a.examSignals.length / 3) + 10 * ({ HIGH: 1, MEDIUM: 0.6, LOW: 0.2 }[a.confidence])) });
  }
  const known = parts.filter((p) => p.value != null);
  const total = known.length ? Math.round(known.reduce((s, p) => s + p.value, 0) / known.length) : 0;
  return { parts, total, unjudged: parts.filter((p) => p.value == null).map((p) => p.label) };
}

async function compare(linkA, linkB, chapterId, needText = '') {
  if (!TOPICS[chapterId]) return { ok: false, error: 'Unknown chapter.' };
  const metas = [];
  for (const l of [linkA, linkB]) {
    const m = await fetchMeta(l);
    if (!m.ok) return { ok: false, error: `Couldn't read ${String(l).slice(0, 60)}: ${m.error || (m.notes || []).join('; ') || 'unavailable'}` };
    const c = cached(m.id);
    if (c && !m.chapters.length && c.chapters.length) { m.chapters = c.chapters; m.notes.push('chapter markers taken from my earlier verified copy'); }
    metas.push({ m, minutes: c ? c.minutes : null });
  }
  if (metas[0].m.id === metas[1].m.id) return { ok: false, error: 'Those are the same video - send two different links.' };
  const need = parseNeed(needText, chapterId);
  const A = analyse(metas[0].m, chapterId, metas[0].minutes);
  const B = analyse(metas[1].m, chapterId, metas[1].minutes);
  const sA = needScore(A, metas[0].m, need), sB = needScore(B, metas[1].m, need);
  A.needScore = sA; B.needScore = sB; A.score = sA.total; B.score = sB.total;
  const winner = A.score === B.score ? null : (A.score > B.score ? A : B);
  const loser = winner === A ? B : A;
  const wS = winner ? winner.needScore : null;
  const lowConf = A.confidence === 'LOW' || B.confidence === 'LOW';
  const forNeed = need.criteria.length || need.topics.length ? need.parts : null;
  const why = winner ? wS.parts.filter((p) => p.value != null).map((p) => `${p.label} ${p.value}/100 vs ${loser.needScore.parts.find((x) => x.label === p.label)?.value ?? '?'}/100`) : [];
  const caveats = [];
  if (lowConf) caveats.push('Confidence is LOW for at least one video: no chapter markers, so I judged it from title and description only.');
  if (need.cannotJudge.length) caveats.push(`I can't judge ${need.cannotJudge.join(', ')} - I can't watch or listen to videos.`);
  const unj = [...new Set([...sA.unjudged, ...sB.unjudged])];
  if (unj.length) caveats.push(`I couldn't judge "${unj.join(', ')}" for a video (its length is unknown).`);
  if (!need.criteria.length && !need.topics.length) caveats.push('You did not say what you need, so I used a balanced default. Tell me e.g. "fastest revision", "exam answers", "full syllabus" or a topic name to rank by that.');
  return {
    ok: true, chapterId, need: { text: need.text, understood: [...need.criteria.map((c) => c.label), ...need.topics.map((t) => `topic: ${t.name}`)] }, videos: [A, B], caveats,
    recommendation: winner
      ? { id: winner.id, title: winner.title, reasons: why, text: `For "${need.text || 'a general study need'}", go with "${winner.title}" (${winner.channel}): ${why.join('; ')}.` }
      : { id: null, reasons: [], text: 'On your need these look equal. Pick the teacher you follow better.' },
    method: 'Ranked on YOUR need (criteria it understood are listed above). Evidence = title, description and creator chapter markers; no transcripts, I have not watched the videos.',
  };
}

function formatForChat(r) {
  if (!r.ok) return r.error;
  const line = (a) => `${a.channel} - ${a.title.slice(0, 55)}\n  ${a.coveredTopics}/${a.totalTopics} NCERT sections, ${a.markerCount} chapter markers, evidence ${a.confidence}, need-score ${a.score}/100\n  exam signals: ${a.examSignals.slice(0, 4).join(', ') || 'none seen'}`;
  const [A, B] = r.videos;
  return `You need: ${r.need.understood.join(' + ') || 'not specified'}\n\nVideo 1: ${line(A)}\n\nVideo 2: ${line(B)}\n\n${r.recommendation.text}${r.caveats.length ? '\n\nNote: ' + r.caveats.join(' ') : ''}\n\n${r.method}`;
}
module.exports = { compare, formatForChat, analyse, parseNeed, needScoreFor: needScore };
