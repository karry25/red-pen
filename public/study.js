// Red Pen Study Kit - focus timer, spaced revision, daily goals.
// Everything lives in memory for this session only: nothing is stored,
// nothing leaves the phone. Reloading resets it (honest v1 scope).
const studyKit = (() => {
  // ---------- Focus timer (Pomodoro) ----------
  const FOCUS_MIN = 25;
  const BREAK_MIN = 5;
  let mode = 'focus'; // 'focus' | 'break'
  let remaining = FOCUS_MIN * 60;
  let ticking = null;
  let cycles = 0;

  function fmt(s) {
    const m = Math.floor(s / 60), r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  }

  function chime() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [523.25, 659.25, 783.99].forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = f; o.type = 'sine';
        g.gain.setValueAtTime(0.001, ctx.currentTime + i * 0.18);
        g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + i * 0.18 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.16);
        o.connect(g).connect(ctx.destination);
        o.start(ctx.currentTime + i * 0.18); o.stop(ctx.currentTime + i * 0.18 + 0.17);
      });
    } catch (e) { /* audio blocked; ignore */ }
  }

  function renderTimer() {
    const el = document.getElementById('timer-display');
    if (!el) return;
    el.textContent = fmt(remaining);
    document.getElementById('timer-mode').textContent = mode === 'focus' ? 'focus time' : 'break time';
    document.getElementById('timer-cycles').textContent = cycles ? `${cycles} focus round${cycles > 1 ? 's' : ''} done` : '';
    document.getElementById('timer-card').classList.toggle('on-break', mode === 'break');
    document.getElementById('timer-start').innerHTML = icon(ticking ? 'pause' : 'play') + (ticking ? ' Pause' : remaining < FOCUS_MIN * 60 && mode === 'focus' ? ' Resume' : ' Start');
  }

  function tick() {
    remaining -= 1;
    if (remaining <= 0) {
      chime();
      if (mode === 'focus') { mode = 'break'; remaining = BREAK_MIN * 60; cycles += 1; goalDone('focus'); }
      else { mode = 'focus'; remaining = FOCUS_MIN * 60; }
    }
    renderTimer();
  }

  function startPause() {
    if (ticking) { clearInterval(ticking); ticking = null; }
    else { ticking = setInterval(tick, 1000); }
    renderTimer();
  }
  function reset() {
    clearInterval(ticking); ticking = null; mode = 'focus'; remaining = FOCUS_MIN * 60;
    renderTimer();
  }

  // ---------- Daily goals (session) ----------
  const goals = [
    { id: 'grade', label: 'Grade 1 answer' },
    { id: 'doubt', label: 'Ask 1 doubt' },
    { id: 'teach', label: 'Teach the junior once' },
    { id: 'focus', label: 'Finish 1 focus round' },
  ];
  const done = new Set();
  function goalDone(id) {
    if (done.has(id)) return;
    done.add(id);
    renderGoals();
  }
  function renderGoals() {
    const el = document.getElementById('goals-list');
    if (!el) return;
    el.innerHTML = goals.map((g) =>
      `<div class="goal ${done.has(g.id) ? 'done' : ''}"><span class="goal-tick">${done.has(g.id) ? icon('check') : ''}</span>${g.label}</div>`
    ).join('');
    document.getElementById('goals-progress').textContent = `${done.size}/${goals.length} today`;
  }

  // ---------- Spaced revision (session) ----------
  // Real spacing schedule: 10 min, then 1 hour, then "next session"
  // (longer horizons need storage - honestly out of v1 scope).
  const STEPS = [10 * 60 * 1000, 60 * 60 * 1000];
  const queue = []; // {label, module, due, step}
  function scheduleRevision(label, moduleSelector) {
    if (queue.some((q) => q.label === label)) return;
    queue.push({ label, moduleSelector, due: Date.now() + STEPS[0], step: 0 });
    renderRevision();
  }
  function renderRevision() {
    const el = document.getElementById('revision-list');
    if (!el) return;
    if (!queue.length) {
      el.innerHTML = '<div class="hint">Missed points and finished topics land here for a re-check.</div>';
      return;
    }
    const now = Date.now();
    el.innerHTML = queue.map((q, i) => {
      const dueIn = Math.max(0, Math.round((q.due - now) / 60000));
      const ready = q.due <= now;
      return `<div class="rev-item ${ready ? 'ready' : ''}">
        <span>${q.label}</span>
        ${ready ? `<button class="rev-now" data-i="${i}">revise now</button>` : `<span class="rev-when">in ~${dueIn} min</span>`}
      </div>`;
    }).join('');
    el.querySelectorAll('.rev-now').forEach((b) => {
      b.onclick = () => {
        const q = queue[b.dataset.i];
        document.querySelector(q.moduleSelector)?.scrollIntoView({ behavior: 'smooth' });
        if (q.step + 1 < STEPS.length) { q.step += 1; q.due = Date.now() + STEPS[q.step]; }
        else { queue.splice(queue.indexOf(q), 1); }
        renderRevision();
      };
    });
  }
  setInterval(renderRevision, 30000);

  // ---------- events from the modules ----------
  function notify(kind, data = {}) {
    if (kind === 'grade') {
      goalDone('grade');
      if (data.score < data.maxScore && data.missed) {
        scheduleRevision(`${data.label} - missed: ${data.missed}`, '#step-question');
      }
    }
    if (kind === 'doubt') goalDone('doubt');
    if (kind === 'teach-done') {
      goalDone('teach');
      scheduleRevision(`Re-explain: ${data.label}`, '#step-teach');
    }
  }

  function init() {
    document.getElementById('timer-start').onclick = startPause;
    document.getElementById('timer-reset').onclick = reset;
    renderTimer(); renderGoals(); renderRevision();
  }

  return { init, notify };
})();

window.addEventListener('load', studyKit.init);

window.studyKit = studyKit;
