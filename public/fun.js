// Red Pen fun layer - streaks, celebrations, beat-your-score.
// Session-only: reload resets everything. No data stored.
const fun = (() => {
  const state = {
    improveStreak: 0,       // consecutive score improvements this session
    best: {},               // questionId -> best score
    attempts: {},           // questionId -> attempts
  };

  const QUIPS = {
    improved: ['Arre wah, upar gaya!', 'Ab examiner ko bhi maza aayega.', 'Ye hui na baat - fix kaam kar gaya!', 'Level up!'],
    full: ['FULL MARKS. Examiner ka favourite student spotted.', 'Pakka board-ready answer. Frame this one.', 'Ekdam perfect - ab isko kal dobara likhna!'],
    same: ['Same score - the red chips below are your targets.', 'Flat line. Pick one missing keyword and add it.'],
    first: ['First attempt done - ab isse better karna hai.', 'Baseline set. Ab climb!'],
  };
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function confetti(big = false) {
    const colors = ['#b8503c', '#6f9272', '#c08a2d', '#7d94b5', '#e8b4b8'];
    const n = big ? 60 : 30;
    for (let i = 0; i < n; i++) {
      const d = document.createElement('div');
      d.className = 'confetti-bit';
      d.style.left = Math.random() * 100 + 'vw';
      d.style.background = colors[i % colors.length];
      d.style.animationDelay = Math.random() * 0.4 + 's';
      d.style.width = d.style.height = 6 + Math.random() * 6 + 'px';
      document.body.appendChild(d);
      setTimeout(() => d.remove(), 2600);
    }
  }

  function banner(text, big = false) {
    const b = document.createElement('div');
    b.className = 'fun-banner' + (big ? ' big' : '');
    b.innerHTML = text;
    document.body.appendChild(b);
    setTimeout(() => b.classList.add('show'), 10);
    setTimeout(() => { b.classList.remove('show'); setTimeout(() => b.remove(), 400); }, big ? 3200 : 2200);
  }

  // Called after every grading. Returns a challenge line for the UI.
  function onGrade(questionId, score, maxScore) {
    const prevBest = state.best[questionId];
    state.attempts[questionId] = (state.attempts[questionId] || 0) + 1;
    let challenge;
    if (prevBest === undefined) {
      banner(pick(QUIPS.first));
      challenge = `First attempt logged. Beat your ${score}/${maxScore}?`;
    } else if (score > prevBest) {
      state.improveStreak += 1;
      banner(pick(QUIPS.improved) + (state.improveStreak >= 2 ? ` Streak: ${state.improveStreak} improvements in a row!` : ''));
      confetti(false);
      challenge = score < maxScore ? `New best: ${score}/${maxScore}. One more push to full?` : null;
    } else if (score === prevBest) {
      challenge = `Your best here is ${prevBest}/${maxScore}. Beat it!`;
    } else {
      state.improveStreak = 0;
      challenge = `Below your best of ${prevBest}/${maxScore} - check the red chips and reclaim it.`;
    }
    if (score >= maxScore && (prevBest === undefined || prevBest < maxScore)) {
      banner(pick(QUIPS.full), true);
      confetti(true);
      challenge = 'Full marks! Same question tomorrow = locked in forever.';
    }
    state.best[questionId] = Math.max(prevBest || 0, score);
    renderStreak();
    return challenge;
  }

  function renderStreak() {
    const el = document.getElementById('fun-streak');
    if (!el) return;
    el.textContent = state.improveStreak >= 2
      ? `Improvement streak: ${state.improveStreak} in a row (this session)`
      : '';
  }

  return { onGrade, renderStreak };
})();
window.fun = fun;
