document.getElementById('logo-icon').innerHTML = icon('pen');
document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = icon(el.dataset.icon); });
let questions = [];
let selectedId = null;
let lastScore = null;
let activeChapter = new URLSearchParams(location.search).get('chapter') || 'ch1';

// Chapter switcher: each chapter has its own subject-expert agent.
async function loadChapters() {
  const res = await fetch('/api/chapters');
  const { chapters } = await res.json();
  const sw = document.getElementById('ch-switch');
  sw.innerHTML = '';
  chapters.forEach((c) => {
    const b = document.createElement('button');
    b.className = 'ch-chip' + (c.id === activeChapter ? ' active' : '');
    b.textContent = `Ch.${c.number} ${c.title}`;
    b.title = `${c.agent} (subject-expert agent) · ${c.counts.questions}+${c.counts.pyqs} questions, ${c.counts.doubts} doubt answers, ${c.counts.topics} teach topics`;
    b.onclick = () => { activeChapter = c.id; loadChapters(); load(); loadTeach(); loadExplainers(); };
    sw.appendChild(b);
  });
  document.getElementById('footer-chapters').textContent =
    chapters.map((c) => `Ch.${c.number} ${c.title}`).join(' · ');
}

async function load() {
  const res = await fetch('/api/questions?chapter=' + activeChapter);
  const data = await res.json();
  document.getElementById('chapter').textContent = data.chapter;
  questions = data.questions;
  // most-asked PYQ strip
  const ma = document.getElementById('most-asked-list');
  ma.innerHTML = '';
  (data.mostAsked || []).forEach((q) => {
    const el = document.createElement('div');
    el.className = 'q-item pyq';
    el.innerHTML = `<span class="marks">${q.marks} marks</span>${q.text}
      <div class="pyq-badges"><span class="badge">${q.source.split('(')[0]}</span>${q.repeated ? '<span class="badge rep">repeated across papers</span>' : ''}</div>`;
    el.title = q.repeatNote || '';
    el.onclick = () => {
      selectedId = q.id;
      document.querySelectorAll('.q-item').forEach((x) => x.classList.remove('selected'));
      el.classList.add('selected');
      document.getElementById('chosen-question').textContent = q.text + ' [' + q.source + ']';
      document.getElementById('step-result').classList.add('hidden');
      lastScore = null;
      document.getElementById('answer').scrollIntoView({ behavior: 'smooth' });
    };
    ma.appendChild(el);
  });
  document.getElementById('most-asked-note').textContent = data.mostAskedNote || '';

  const list = document.getElementById('question-list');
  list.innerHTML = '';
  questions.forEach((q, i) => {
    const el = document.createElement('div');
    el.className = 'q-item';
    el.innerHTML = `<span class="marks">${q.marks} marks</span>Q${i + 1}. ${q.text}`;
    el.onclick = () => {
      selectedId = q.id;
      document.querySelectorAll('.q-item').forEach((x) => x.classList.remove('selected'));
      el.classList.add('selected');
      document.getElementById('chosen-question').textContent = q.text;
      document.getElementById('step-result').classList.add('hidden');
      lastScore = null;
    };
    list.appendChild(el);
  });
}

async function grade() {
  const answer = document.getElementById('answer').value;
  if (!selectedId) { alert('Pick a question first.'); return; }
  if (!answer.trim()) { alert('Write your answer first.'); return; }
  const btn = document.getElementById('grade-btn');
  btn.disabled = true;
  btn.textContent = 'Checking...';
  try {
    const res = await fetch('/api/grade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId: selectedId, answer }),
    });
    const r = await res.json();
    if (r.error) { alert(r.error); return; }
    showResult(r);
  } finally {
    btn.disabled = false;
    btn.textContent = '✔ Check it like an examiner';
  }
}

function showResult(r) {
  if (window.studyKit) {
    const missed = r.points.filter((p) => p.status === 'missing').map((p) => p.point.split(':')[0].split(' ').slice(0, 4).join(' ')).join('; ');
    const qText = document.getElementById('chosen-question').textContent.split(' ').slice(0, 5).join(' ');
    studyKit.notify('grade', { score: r.score, maxScore: r.maxScore, missed, label: qText });
  }
  document.getElementById('step-result').classList.remove('hidden');
  document.getElementById('score').textContent = r.score;
  document.getElementById('score-max').textContent = ' / ' + r.maxScore;

  const challenge = window.fun ? fun.onGrade(r.questionId, r.score, r.maxScore) : null;
  document.getElementById('fun-challenge').textContent = challenge || '';
  const delta = document.getElementById('score-delta');
  if (lastScore !== null && r.score > lastScore) {
    delta.textContent = `▲ up from ${lastScore} - your fix worked!`;
  } else if (lastScore !== null && r.score === lastScore) {
    delta.textContent = 'same as before - check the missing keywords below';
    delta.style.color = '#d98e04';
  } else if (lastScore !== null) {
    delta.textContent = `down from ${lastScore}`;
    delta.style.color = '#d92b2b';
  } else {
    delta.textContent = '';
  }
  lastScore = r.score;

  const icons = { full: icon('check'), partial: '<b style="color:#d98e04">~</b>', missing: '<b style="color:#d92b2b">&#10007;</b>' };
  const list = document.getElementById('point-list');
  list.innerHTML = '';
  r.points.forEach((p) => {
    const el = document.createElement('div');
    el.className = 'point ' + p.status;
    const chips = p.missingKeywords.length
      ? `<div class="chips">missing: ${p.missingKeywords.map((k) => `<span class="chip">${k}</span>`).join('')}</div>`
      : '';
    el.innerHTML = `<span class="icon">${icons[p.status]}</span>
      <div><div>${p.point}</div>${chips}</div>
      <span class="pt-marks">${p.earnedMarks}/${p.maxMarks}</span>`;
    list.appendChild(el);
  });

  document.getElementById('notes').innerHTML = r.notes.map((n) => `<div>• ${n}</div>`).join('');
  document.getElementById('model-answer').textContent = r.modelAnswer;
  document.getElementById('agent-trace').innerHTML = (r.trace || [])
    .map((t) => `<div class="trace-line"><b>${t.agent}</b> · ${t.action}</div>`).join('');
  document.getElementById('engine').textContent = 'Checked by: ' + r.engine;
  document.getElementById('step-result').scrollIntoView({ behavior: 'smooth' });
}

document.getElementById('grade-btn').onclick = grade;
document.getElementById('doubt-btn').onclick = async () => {
  const doubt = document.getElementById('doubt').value;
  if (!doubt.trim()) { alert('Type your doubt first.'); return; }
  const res = await fetch('/api/doubt', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ doubt, chapterId: activeChapter }),
  });
  const r = await res.json();
  document.getElementById('doubt-result').classList.remove('hidden');
  document.getElementById('digest-result').classList.add('hidden');
  if (window.studyKit) studyKit.notify('doubt');
  document.getElementById('doubt-answer').innerHTML =
    (r.card ? `<img class="doubt-card" src="/cards/${r.card}" alt="visual note">` : '') +
    `<span></span>`;
  document.getElementById('doubt-answer').querySelector('span').textContent = r.answer;
  if (r.source) {
    const src = document.createElement('div');
    src.className = 'why';
    src.textContent = 'Source: ' + r.source;
    document.getElementById('doubt-answer').appendChild(src);
  }
  document.getElementById('doubt-engine').textContent = 'Answered by: Doubt agent (' + (r.answered ? 'matched: ' + r.topic : 'not in knowledge base yet') + ') · ' + r.engine;
};

document.getElementById('digest-btn').onclick = async () => {
  const res = await fetch('/api/digest');
  const r = await res.json();
  document.getElementById('digest-result').classList.remove('hidden');
  document.getElementById('doubt-result').classList.add('hidden');
  const rows = r.topConfusions.length
    ? r.topConfusions.map((c, i) => `<div class="point full"><span class="icon">${i + 1}.</span><div>${c.topic}</div><span class="pt-marks">${c.count}x</span></div>`).join('')
    : '<div class="hint">No doubts asked yet.</div>';
  document.getElementById('digest-result').innerHTML = `<div class="step-label" style="margin-top:10px">Batch confusions today (${r.totalDoubts} doubts)</div>${rows}<div class="engine">${r.note}</div>`;
};

document.getElementById('retry-btn').onclick = () => {
  document.getElementById('answer').focus();
  document.getElementById('answer').scrollIntoView({ behavior: 'smooth' });
};
loadChapters();
load();

// Demo hook for testing/screenshots only: #demo auto-fills and grades.
if (location.hash === '#demo') {
  window.addEventListener('load', () => setTimeout(() => {
    document.querySelectorAll('.q-item')[2].click();
    document.getElementById('answer').value = 'A single reactant breaks down into two or more products. Thermal decomposition is by heat like CaCO3 -> CaO + CO2. Electrolysis of water gives H2 and O2.';
    grade();
  }, 300));
}
if (location.hash === '#demo2') {
  window.addEventListener('load', () => setTimeout(() => {
    document.getElementById('doubt').value = 'exothermic matlab kya hota hai?';
    document.getElementById('doubt-btn').click();
    document.getElementById('step-doubt').scrollIntoView();
  }, 300));
}

// ---- Module 3: Teach-the-Junior ----
let teachTopics = [];
let teachTopicId = null;
async function loadTeach() {
  const res = await fetch('/api/teach/topics?chapter=' + activeChapter);
  const data = await res.json();
  teachTopics = data.topics;
  const list = document.getElementById('topic-list');
  list.innerHTML = '';
  teachTopics.forEach((t) => {
    const el = document.createElement('div');
    el.className = 'q-item';
    el.textContent = t.name;
    el.onclick = () => {
      teachTopicId = t.id;
      document.querySelectorAll('#topic-list .q-item').forEach((x) => x.classList.remove('selected'));
      el.classList.add('selected');
      const open = document.getElementById('junior-opening');
      open.innerHTML = icon('kid') + ' ' + t.juniorOpening;
      open.classList.remove('hidden');
      document.getElementById('teach-input-area').classList.remove('hidden');
      document.getElementById('teach-result').classList.add('hidden');
    };
    list.appendChild(el);
  });
}
document.getElementById('teach-btn').onclick = async () => {
  const explanation = document.getElementById('explanation').value;
  if (!teachTopicId) { alert('Pick a topic first.'); return; }
  if (!explanation.trim()) { alert('Explain something first.'); return; }
  const res = await fetch('/api/teach', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topicId: teachTopicId, explanation }),
  });
  const r = await res.json();
  if (r.error) { alert(r.error); return; }
  document.getElementById('teach-result').classList.remove('hidden');
  document.getElementById('meter-pct').textContent = r.meter + '%';
  document.getElementById('meter-fill').style.width = r.meter + '%';
  document.getElementById('junior-reply').innerHTML = icon('kid') + ' ' + r.juniorReply;
  const pts = [];
  r.coveredPoints.forEach((p) => pts.push(`<div class="point full"><span class="icon">✓</span><div>${p}</div></div>`));
  r.missingPoints.forEach((p) => pts.push(`<div class="point missing"><span class="icon">✗</span><div>${p}</div></div>`));
  document.getElementById('teach-points').innerHTML = pts.join('');
  if (r.done && window.studyKit) {
    const t = teachTopics.find((x) => x.id === teachTopicId);
    studyKit.notify('teach-done', { label: t ? t.name : 'topic' });
  }
  document.getElementById('teach-engine').textContent = r.done ? 'Junior fully understood! ' + r.engine : 'Assessor agent keeps the meter honest · ' + r.engine;
  document.getElementById('explanation').value = '';
};
loadTeach();

// ---- Module 4: Triage ----
async function loadTriage() {
  const res = await fetch('/api/triage/chapters');
  const data = await res.json();
  const box = document.getElementById('triage-chapters');
  data.chapters.forEach((ch) => {
    const el = document.createElement('div');
    el.className = 'triage-ch';
    el.innerHTML = `<span>${ch.name}</span><span class="w">~${ch.weight}m</span>
      <select data-ch="${ch.id}">
        <option value="0">blank</option><option value="1" selected>shaky</option><option value="2">strong</option>
      </select>`;
    box.appendChild(el);
  });
  document.getElementById('triage-note').textContent = data.note;
}
document.getElementById('triage-btn').onclick = async () => {
  const confidence = {};
  document.querySelectorAll('#triage-chapters select').forEach((sel) => { confidence[sel.dataset.ch] = parseInt(sel.value, 10); });
  const res = await fetch('/api/triage/plan', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ daysLeft: document.getElementById('days-left').value, confidence }),
  });
  const r = await res.json();
  const box = document.getElementById('triage-result');
  box.classList.remove('hidden');
  const group = (title, cls, items, render) => items.length
    ? `<div class="plan-group ${cls}"><div class="g-title">${title}</div>${items.map(render).join('')}</div>` : '';
  box.innerHTML =
    group(icon('target') + ' FOCUS (these first)', 'focus', r.focus, (c) => `<div class="plan-item">• ${c.name} <b>~${c.weight}m</b> (${c.confidence})</div>`) +
    group(icon('revise') + ' REVISE quickly', 'revise', r.revise, (c) => `<div class="plan-item">• ${c.name} <b>~${c.weight}m</b> (${c.confidence})</div>`) +
    group(icon('skip') + ' SKIP (honest call)', 'skip', r.skip, (c) => `<div class="plan-item">• ${c.name} <b>~${c.weight}m</b></div>`) +
    `<div class="g-title" style="font-weight:800;font-size:13px;margin:8px 0 4px">${icon('calendar')} Your timetable</div>` +
    (r.timetable || []).map((d) =>
      `<div class="tt-day"><b>Day ${d.day}</b>` +
      d.slots.map((sl) => `<div class="tt-slot"><span class="tt-time">${sl.time}</span><span class="tt-kind">${sl.kind}</span><div class="tt-label">${sl.label}</div></div>`).join('') +
      `</div>`).join('') +
    `<div class="why">${r.timetableWhy || ''}</div>` +
    `<div class="hint" style="margin-top:8px">${r.summary}</div>`;
};
loadTriage();
if (location.hash === '#demo3') {
  window.addEventListener('load', () => setTimeout(() => {
    document.querySelectorAll('#topic-list .q-item')[1].click();
    document.getElementById('explanation').value = 'Ek single reactant toot ke two or more products banata hai. Thermal decomposition heat se hota hai jaise CaCO3 ko garam karo.';
    document.getElementById('teach-btn').click();
  }, 300));
}
if (location.hash === '#demo4') {
  window.addEventListener('load', () => setTimeout(() => {
    document.getElementById('days-left').value = 7;
    document.getElementById('triage-btn').click();
  }, 400));
}
if (location.hash === '#demo5') {
  window.addEventListener('load', () => setTimeout(() => {
    document.getElementById('timer-start').click();
    document.querySelectorAll('.q-item')[2].click();
    document.getElementById('answer').value = 'A single reactant breaks down into two or more products. Thermal decomposition is by heat like CaCO3 -> CaO + CO2. Electrolysis of water gives H2 and O2.';
    grade();
    setTimeout(() => document.getElementById('study-kit').scrollIntoView(), 800);
  }, 300));
}

// ---- Explainers (blog-style reads) ----
async function loadExplainers() {
  const res = await fetch('/api/explainers?chapter=' + activeChapter);
  const data = await res.json();
  const box = document.getElementById('explainer-list');
  box.innerHTML = '';
  data.explainers.forEach((x) => {
    const el = document.createElement('details');
    el.className = 'explainer';
    el.innerHTML = `<summary><b>${x.title}</b></summary>
      <div class="x-body">
        ${x.card ? `<img class="doubt-card" src="/cards/${x.card}" alt="visual note" loading="lazy">` : ''}
        <p class="x-hook"></p>
        <p class="x-concept"></p>
        <div class="x-hack"><b>Exam hack:</b> <span class="x-hack-text"></span></div>
        <div class="why x-src"></div>
        <div class="x-links"></div>
      </div>`;
    el.querySelector('.x-hook').textContent = x.hook;
    el.querySelector('.x-concept').textContent = x.concept;
    el.querySelector('.x-hack-text').textContent = x.hack;
    el.querySelector('.x-src').textContent = 'Why the hack works: ' + x.hackSource;
    el.querySelector('.x-links').innerHTML = 'Learn more: ' + (x.learnMore || [])
      .map((l) => `<a href="${l.url}" target="_blank" rel="noopener">${l.label}</a>`).join(' · ');
    box.appendChild(el);
  });
}
loadExplainers();
