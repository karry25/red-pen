// "More ways to study": checked videos, find/compare, Exemplar practice, formulas, study path, sources.
// All remote text is inserted with textContent (never innerHTML), links only if they are youtube.com / youtu.be.
(function () {
  const root = document.getElementById('extras');
  if (!root) return;
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const chapter = () => (typeof activeChapter !== 'undefined' ? activeChapter : 'ch1');
  const safeYT = (u) => { try { const x = new URL(u); return (x.protocol === 'https:' && /(^|\.)(youtube\.com|youtu\.be)$/.test(x.hostname)) ? x.href : null; } catch { return null; } };
  const get = async (p) => (await fetch(p)).json();
  const post = async (p, b) => (await fetch(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).json();
  const why = (t) => el('div', 'why', 'Why: ' + t);

  const tabs = [
    ['Videos', videosTab], ['Find / compare', findTab], ['Extra practice', exemplarTab],
    ['Formulas', formulasTab], ['Study path', pathTab], ['Why this works', sourcesTab],
  ];
  const bar = el('div', 'ex-tabs'); const body = el('div', 'ex-body');
  tabs.forEach(([name, fn], i) => {
    const b = el('button', 'ex-tab' + (i === 0 ? ' active' : ''), name);
    b.onclick = () => { [...bar.children].forEach((c) => c.classList.remove('active')); b.classList.add('active'); show(fn); };
    bar.appendChild(b);
  });
  root.appendChild(bar); root.appendChild(body);
  async function show(fn) { body.replaceChildren(el('div', 'ex-note', 'Loading...')); try { body.replaceChildren(await fn()); } catch { body.replaceChildren(el('div', 'ex-note', 'Could not load this right now. Try again in a moment.')); } }
  window.addEventListener('redpen-chapter', () => { const a = bar.querySelector('.active'); const i = [...bar.children].indexOf(a); show(tabs[i][1]); });

  function videoRow(v) {
    const r = el('div', 'ex-row'); const href = safeYT(v.url);
    const t = href ? Object.assign(el('a', 'ex-link', v.title), { href, target: '_blank', rel: 'noopener noreferrer' }) : el('span', '', v.title);
    r.appendChild(t);
    r.appendChild(el('div', 'ex-meta', [v.channel, v.minutes ? v.minutes + ' min' : null, v.level, v.markers ? v.markers + ' chapter markers' : null].filter(Boolean).join(' · ')));
    return r;
  }
  async function videosTab() {
    const d = await get('/api/videos?chapter=' + chapter()); const w = el('div');
    if (!d.available) { w.appendChild(el('div', 'ex-note', 'No checked videos for this chapter yet. I only list links I have verified, so this is empty for now.')); return w; }
    d.topics.forEach((t) => { w.appendChild(el('div', 'ex-h', `${t.topic} (${t.ncert})`)); t.videos.forEach((v) => w.appendChild(videoRow(v))); });
    w.appendChild(el('div', 'ex-note', d.note)); w.appendChild(why('looking at one topic at a time and testing yourself after beats watching passively - Dunlosky et al. 2013.'));
    return w;
  }
  async function findTab() {
    const w = el('div');
    const need = Object.assign(el('input'), { placeholder: 'What do you need? e.g. fast revision, exam answers', maxLength: 200 });
    const lang = el('select'); ['', 'english', 'hindi', 'hinglish', 'marathi'].forEach((l) => lang.appendChild(Object.assign(el('option', '', l || 'any language'), { value: l })));
    const go = el('button', 'btn small primary', 'Find videos'); const out = el('div');
    go.onclick = async () => { out.replaceChildren(el('div', 'ex-note', 'Searching...')); const r = await get(`/api/videos/find?chapter=${chapter()}&need=${encodeURIComponent(need.value)}&lang=${lang.value}`); out.replaceChildren(); if (!r.ok) { out.appendChild(el('div', 'ex-note', 'Search is not available right now.')); return; } (r.results || []).slice(0, 6).forEach((v) => { const row = videoRow(v); row.appendChild(el('div', 'ex-meta', `${v.languageSignal || ''}${v.evidence ? ' · evidence ' + v.evidence : ''}`)); out.appendChild(row); }); out.appendChild(el('div', 'ex-note', 'Honest note: I judge by title, description and chapter markers. I cannot watch videos or read transcripts or likes, and language is guessed from the title only.')); };
    w.append(el('div', 'ex-h', 'Find videos for your need'), need, lang, go, out);
    const a = Object.assign(el('input'), { placeholder: 'YouTube link 1' }), b = Object.assign(el('input'), { placeholder: 'YouTube link 2' });
    const n2 = Object.assign(el('input'), { placeholder: 'Your need (optional)', maxLength: 200 }); const cmp = el('button', 'btn small primary', 'Compare'); const out2 = el('div');
    cmp.onclick = async () => { out2.replaceChildren(el('div', 'ex-note', 'Comparing...')); const r = await post('/api/compare', { a: a.value, b: b.value, chapter: chapter(), need: n2.value }); out2.replaceChildren(); if (!r.ok) { out2.appendChild(el('div', 'ex-note', r.error || 'Could not compare these links.')); return; } r.videos.forEach((v) => { const row = videoRow({ ...v, url: 'https://www.youtube.com/watch?v=' + v.id }); row.appendChild(el('div', 'ex-meta', `Covers ${v.coveredTopics}/${v.totalTopics} NCERT topics · confidence ${v.confidence} · score ${v.score}`)); out2.appendChild(row); }); (r.verdict ? [r.verdict] : []).forEach((x) => out2.appendChild(el('div', 'ex-note', typeof x === 'string' ? x : JSON.stringify(x)))); };
    w.append(el('div', 'ex-h', 'Compare two videos'), a, b, n2, cmp, out2); w.appendChild(why('choose by your goal, then practise - practice testing and spacing are the best-supported methods (Dunlosky et al. 2013).'));
    return w;
  }
  let seen = [];
  async function exemplarTab() {
    const w = el('div'); const d = await get(`/api/exemplar?chapter=${chapter()}&seen=${seen.join(',')}`);
    if (!d.question) { w.appendChild(el('div', 'ex-note', 'No Exemplar questions for this chapter.')); return w; }
    const q = d.question; seen = [...seen, q.id].slice(-20);
    w.appendChild(el('div', 'ex-h', 'Extra practice - NCERT Exemplar (official)')); w.appendChild(el('div', 'ex-q', q.stem));
    const res = el('div', 'ex-note');
    Object.entries(q.options).forEach(([k, v]) => { const b = el('button', 'btn ghost small ex-opt', `(${k}) ${v}`); b.onclick = async () => { const r = await post('/api/exemplar/check', { id: q.id, letter: k }); res.textContent = r.correct ? `Correct. (${r.answer}) ${r.answerText}` : `Not this time. Official key: (${r.answer}) ${r.answerText}.`; res.appendChild(el('div', 'ex-meta', r.source)); }; w.appendChild(b); });
    w.appendChild(res); const next = el('button', 'btn small', 'Another one'); next.onclick = () => show(exemplarTab); w.appendChild(next);
    w.appendChild(el('div', 'ex-note', 'This is extra practice from the official NCERT Exemplar book, separate from the board-paper "most asked" list.')); w.appendChild(why('testing yourself beats rereading - Roediger & Karpicke 2006.'));
    return w;
  }
  async function formulasTab() {
    const d = await get('/api/formulas?chapter=' + chapter()); const w = el('div');
    d.items.forEach((i) => { const r = el('div', 'ex-row'); r.appendChild(el('div', 'ex-h', i.title)); r.appendChild(el('div', '', i.body)); if (i.mnemonic) r.appendChild(el('div', 'ex-meta', 'Memory aid (mine, not NCERT): ' + i.mnemonic)); r.appendChild(el('div', 'ex-meta', i.ncert)); w.appendChild(r); });
    w.appendChild(el('div', 'ex-note', d.note)); w.appendChild(why('cover the answer and recall it first - testing yourself works better than rereading (Roediger & Karpicke 2006); mnemonics help a little (Dunlosky et al. 2013).'));
    return w;
  }
  async function pathTab() {
    const w = el('div'); const days = Object.assign(el('input'), { type: 'number', min: 1, max: 30, value: 7 }); const mins = Object.assign(el('input'), { type: 'number', min: 20, max: 240, value: 60 });
    const out = el('pre', 'ex-pre'); const go = el('button', 'btn small primary', 'Build my path');
    go.onclick = async () => { const r = await get(`/api/path?days=${days.value}&minutes=${mins.value}`); out.textContent = r.text; };
    w.append(el('div', 'ex-h', 'Days left'), days, el('div', 'ex-h', 'Minutes per day'), mins, go, out);
    w.appendChild(el('div', 'ex-note', 'On the web this uses past-paper evidence only. On Telegram, /remember on lets it adapt to the questions you find hard.')); w.appendChild(why('it does not guess your "learning style" (research does not support matching teaching to style - Pashler et al. 2008); it uses what is asked most and what you find hard.'));
    return w;
  }
  async function sourcesTab() {
    const d = await get('/api/sources'); const w = el('div');
    Object.values(d.items).forEach((x) => { const r = el('div', 'src-row'); r.appendChild(el('div', 'src-cite', x.cite)); r.appendChild(el('div', 'ex-meta', x.claim)); const a = Object.assign(el('a', 'src-link', 'Open source'), { href: x.url, target: '_blank', rel: 'noopener noreferrer' }); r.appendChild(a); w.appendChild(r); });
    return w;
  }
  const startTab = Math.max(0, Math.min(tabs.length - 1, parseInt(new URLSearchParams(location.search).get('tab'), 10) || 0));
  [...bar.children].forEach((c, i) => c.classList.toggle('active', i === startTab));
  show(tabs[startTab][1]);
})();
