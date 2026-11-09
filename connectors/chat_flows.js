// Chat flows for the Telegram connector (token-free, fully testable).
// One ChatFlow per chat: a tiny state machine over the SAME agents the
// web app uses. Channel-agnostic: Telegram is the first adapter; the
// flow only ever sees {chatId, text} and returns {text, ...} replies.
const { gradeAnswer } = require('../agents/module1');
const videoCompare = require('../agents/video_compare');
const videoSearch = require('../agents/video_search');
const memory = require('../agents/memory');
const { playlist, formatForChat } = require('../agents/playlist');
const { answerDoubt } = require('../agents/module2');
const module3 = require('../agents/module3');
const module4 = require('../agents/module4');
const coordinator = require('../agents/coordinator');
const formulas = require('../agents/formulas');
const studypath = require('../agents/studypath');
const quickmode = require('../agents/quickmode');
const drip = require('../agents/drip');
const sm = require('../agents/studentmodel');
const exemplar = require('../agents/exemplar');
const { getChapter, findQuestion, detectChapter, listChapters } = require('../agents/chapter');

const WELCOME = `Hi! I'm Red Pen, your study buddy - ask me a doubt or let me quiz you, examiner style.

/quiz - get a question, I grade your answer like a real examiner
/doubt <your doubt> - ask anything, no judgement (Hinglish chalega)
/teach - teach me a topic, my understanding meter shows if YOU got it
/plan <days> - revision plan from past-paper weightage
/goals - today's small study goals
/findvideo <your need> - best videos for you (set /language first)
/compare <link1> <link2> <your need> - which video suits you
/videos [topic] - checked video playlist for the active chapter
/extra - NCERT Exemplar MCQs (extra practice, official answer key)
/extrawrite - written Exemplar practice, checked point by point against the official NCERT answer
/model - what I remember about how you learn, and what it changes
/exam <YYYY-MM-DD> - tell me your exam date once; I re-plan by myself as it gets closer (/exam off stops it)
/formulas - key equations + memory aids for the chapter
/path - a study path built for you (not forced)
/drip on - optional spaced formula reminders (/pause, /stop any time)
/sources - the studies behind how I teach
/chapter <1-4> - switch the chapter I'm working from

Right now my verified material covers NCERT Class 10 Science chapters 1-4 (Chemical Reactions, Acids-Bases-Salts, Metals & Non-metals, Carbon), with answers backed by the NCERT text and CBSE sample papers. More subjects coming - I'll always tell you honestly what I actually know.

Memory: by default I store nothing. If you send /remember on, I save a tiny file about you (chapters/topics you ask about, questions you find hard, your video language - never your messages or name) so I can personalise. /mydata shows it, /forget deletes it, and it auto-deletes after 90 days of not using me. On the free host this memory may reset if the server restarts.`;

// a coarse topic key for memory: first matched chapter hint word, else 'general'
const { matchedHint } = require('../agents/chapter');
const topicKey = (text, chapterId) => (matchedHint(text, chapterId) || 'general').replace(/[^a-z0-9-]/gi, '-').slice(0, 30);

class ChatFlow {
  constructor(chatId) {
    this.chatId = chatId;
    this.mode = null;          // null | 'quiz' | 'teach'
    this.questionId = null;
    this.topicId = null;
    this.level = 'beginner';   // adapts: beginner | intermediate
    this.lastScore = null;
    this.revisionQueue = [];   // {label, due, questionId}
    this.goals = { grade: false, doubt: false, teach: false };
    this.best = {};            // questionId -> best score (session)
    this.improveStreak = 0;
    this.chapterId = 'ch1';    // active chapter; /chapter N switches
    this.lang = null;
    const m = memory.get(chatId); // only exists if the student opted in
    if (m) { if (m.lang) this.lang = m.lang; if (m.chapter && getChapter(m.chapter)) this.chapterId = m.chapter; }
  }

  mem(ev) {
    try {
      memory.record(this.chatId, ev);
      if (ev.type === 'weak') drip.addWeak(this.chatId, ev.questionId);
      if (ev.type === 'strong') drip.dropWeak(this.chatId, ev.questionId);
    } catch { /* memory must never break chat */ }
  }

  chapter() { return getChapter(this.chapterId); }

  // Beginner gets shorter questions first; repeat-verified PYQs come early.
  // With memory on, questions the student found hard come back first (student model).
  pickQuestion() {
    const ch = this.chapter();
    const modelled = sm.weightQuiz(this.chatId, [...ch.pyqs, ...ch.questions]);
    if (modelled) return modelled;
    const pyqPool = ch.pyqs.filter((q) => q.repeated);
    if (pyqPool.length && Math.random() < 0.6) return pyqPool[Math.floor(Math.random() * pyqPool.length)];
    const pool = [...ch.questions].sort((a, b) =>
      this.level === 'beginner' ? a.marks - b.marks : b.marks - a.marks);
    return pool[Math.floor(Math.random() * Math.min(3, pool.length))];
  }

  async handle(text) {
    const t = String(text || '').trim();
    const low = t.toLowerCase();

    if (low === '/start' || low === 'hi' || low === 'hello') {
      const m = memory.get(this.chatId);
      const weak = m ? Object.keys(m.weak).slice(0, 1) : [];
      return { text: WELCOME + (weak.length ? `\n\nWelcome back. You found ${weak[0]} tricky last time - want another go? Send /quiz.` : '') };
    }
    if (low === '/chapter' || low.startsWith('/chapter ')) {
      const n = low.split(' ')[1];
      const all = listChapters();
      if (!n) {
        return { text: `Chapters I can teach right now:\n${all.map((c) => `${c.number}. ${c.title}${c.id === this.chapterId ? '  <- active' : ''}`).join('\n')}\n\nSwitch with /chapter 2` };
      }
      const target = all.find((c) => String(c.number) === n || c.id === `ch${n}`);
      if (!target) return { text: `Chapter ${n} abhi available nahi hai. Available: ${all.map((c) => c.number).join(', ')}` };
      this.chapterId = target.id; this.mem({ type: 'chapter', chapter: target.id });
      return { text: `Switched to Ch.${target.number}: ${target.title}. ${target.agent} (subject expert) is now helping the other agents with verified NCERT content.\n\n/quiz, /doubt, /teach, /most - sab ab is chapter ke.` };
    }
    if (low === '/most') {
      const ch = this.chapter();
      const lines = ch.pyqs.map((q, i) =>
        `${i + 1}. (${q.marks}m, ${q.source.split(',')[0].replace('CBSE Sample Paper ', 'SQP ')})${q.repeated ? ' [REPEATED]' : ''} ${q.text.split('(')[0].slice(0, 90)}`);
      return { text: `Most-asked for Ch.${ch.number} (${ch.title}) from official CBSE sample papers:\n\n` + lines.join('\n\n') + '\n\nType /quiz to practise - repeated ones come first.' };
    }
    if (low === '/goals') {
      const g = this.goals;
      const line = (b, s) => `${b ? '[x]' : '[ ]'} ${s}`;
      return { text: `Today's goals:\n${line(g.grade, 'Grade 1 answer (/quiz)')}\n${line(g.doubt, 'Ask 1 doubt (/doubt)')}\n${line(g.teach, 'Teach me once (/teach)')}` };
    }
    if (low === '/extra' || low === '/exemplar') {
      const q = exemplar.pick(this.chapterId, this.seenExemplar || []);
      if (!q) return { text: 'No Exemplar questions for this chapter yet.' };
      this.seenExemplar = [...(this.seenExemplar || []), q.id].slice(-20);
      this.mode = 'extra'; this.extraId = q.id;
      return { text: exemplar.formatQuestion(q) };
    }
    if (low === '/extrawrite' || low === '/extrashort') {
      const q = exemplar.short.pick(this.chapterId, this.seenExemplarShort || []);
      if (!q) return { text: 'No written Exemplar questions for this chapter yet.' };
      this.seenExemplarShort = [...(this.seenExemplarShort || []), q.id].slice(-20);
      this.mode = 'extrashort'; this.extraShortId = q.id;
      return { text: exemplar.short.formatQuestion(q) };
    }
    if (low === '/formulas') { const ch = this.chapter(); return { text: formulas.formatSheet(ch.chapterId, `Ch.${ch.number} ${ch.title}`) }; }
    if (low === '/sources') {
      const cit = require('../data/citations.json');
      const list = Object.values(cit.items).map((x) => `- ${x.cite}\n  ${x.claim}\n  ${x.url}`);
      return { text: 'Why Red Pen works this way (all checked links):\n' + list.join('\n') };
    }
    if (low.startsWith('/path')) {
      const m = memory.get(this.chatId);
      const days = parseInt(low.split(' ')[1], 10) || 7;
      return { text: studypath.format(studypath.buildPath({ days, minutesPerDay: 60, mem: m })) };
    }
    if (low.startsWith('/drip')) {
      const arg = low.split(/\s+/)[1];
      if (arg === 'on') {
        const n = drip.start(this.chatId, this.chapterId);
        return { text: `Formula reminders ON for Ch.${this.chapter().number}: ${n} cards, at most 2 a day, never between 10pm and 7am. Each one asks you to recall first, then you tap Show. Spacing: 1, 3, 7, 14 days (spaced practice works better than cramming - Cepeda et al. 2006). /pause or /stop any time. To send them I save your chat id in your memory file (/mydata shows it); /stop deletes it. No streaks, no guilt if you skip.${memory.get(this.chatId) ? ' Questions you find hard quietly join the front of your deck - you never have to ask.' : ''}`, buttons: [[{ text: 'Pause', data: 'drip:pause' }, { text: 'Stop', data: 'drip:stop' }]] };
      }
      if (arg === 'resume') { return { text: drip.setPaused(this.chatId, false) ? 'Reminders resumed.' : 'Reminders are not on. Send /drip on.' }; }
      return { text: drip.state(this.chatId) ? `Reminders are ${drip.state(this.chatId).paused ? 'paused (/drip resume)' : 'on'}. /pause or /stop.` : 'Reminders are off. /drip on to start (optional, easy to stop).' };
    }
    if (low === '/pause') return { text: drip.setPaused(this.chatId, true) ? 'Paused. Nothing will be sent until you send /drip resume.' : 'No reminders are running.' };
    if (low === '/stop') { drip.stop(this.chatId); return { text: 'Stopped. Reminder data deleted.' }; }
    if (!t.startsWith('/') && !this.mode && quickmode.isQuick(t)) return { text: quickmode.plan(memory.get(this.chatId), process.env.PUBLIC_BASE_URL) };
    if (low === '/quiz') {
      const q = this.pickQuestion();
      this.mode = 'quiz'; this.questionId = q.id;
      return { text: `Question (${q.marks} marks):\n${q.text}\n\nType your answer like you would in the exam.` };
    }
    if (low === '/teach') {
      const topics = module3.listTopics(this.chapterId);
      const pick = topics[Math.floor(Math.random() * topics.length)];
      this.mode = 'teach'; this.topicId = pick.id;
      return { text: `OK, you are the teacher now!\n\n${pick.juniorOpening}\n\n(Topic: ${pick.name}) - explain in your own words.` };
    }
    if (low.startsWith('/remember')) {
      const arg = low.split(/\s+/)[1];
      if (arg === 'off') { memory.forget(this.chatId); return { text: 'Memory turned off and everything I had saved about you is deleted.' }; }
      if (arg !== 'on') return { text: memory.isOn(this.chatId) ? 'Memory is ON. /mydata to see it, /remember off or /forget to delete it.' : 'Memory is OFF. Send /remember on and I will save a tiny file (topics, hard questions, video language - never your messages or name). /forget deletes it any time.' };
      memory.enable(this.chatId);
      this.mem({ type: 'chapter', chapter: this.chapterId }); if (this.lang) this.mem({ type: 'lang', lang: this.lang });
      return { text: 'Memory ON. I will remember which chapters/topics you ask about, which questions you find hard and your video language - not your messages or name. /mydata shows it, /forget deletes it. Auto-deletes after 90 days of not using me, and on the free host it may reset if the server restarts.' };
    }
    if (low === '/mydata') return { text: memory.summaryText(this.chatId) };
    if (low === '/model') return { text: sm.describe(this.chatId) };
    if (low.startsWith('/exam')) {
      const arg = low.split(/\s+/)[1];
      if (!arg) {
        const rec = memory.get(this.chatId);
        if (!rec || !rec.examDate) return { text: 'No exam date set. Tell me once, e.g. /exam 2027-02-20, and I will quietly re-plan as the date gets closer - you do not have to open me. Needs /remember on. /exam off clears it.' };
        const days = Math.ceil((new Date(rec.examDate + 'T00:00:00+05:30') - Date.now()) / 86400000);
        return { text: `Exam: ${rec.examDate} (${days} day${days === 1 ? '' : 's'} left). I will send you an updated plan at 14, 7, 3 and 1 days before, based on what you still find hard. /exam off clears it.` };
      }
      if (arg === 'off') { this.mem({ type: 'exam', date: null }); return { text: 'Exam date cleared. I will not nudge you about it.' }; }
      const ok = this.mem({ type: 'exam', date: arg, chatId: this.chatId });
      if (!ok) return { text: memory.isOn(this.chatId) ? 'That date does not look right - use /exam YYYY-MM-DD, up to about a year ahead.' : 'First send /remember on - I only keep your exam date if I am allowed to remember anything at all.' };
      const rec = memory.get(this.chatId);
      const days = Math.ceil((new Date(rec.examDate + 'T00:00:00+05:30') - Date.now()) / 86400000);
      return { text: `Noted: ${rec.examDate}, ${days} days away. To message you when it gets close I keep your chat id in your memory file (like /drip does). I will re-plan by myself at 14, 7, 3 and 1 days out, using what you find hard. Sleep easy - I have got the watching. /exam off stops it.` };
    }
    if (low === '/forget') { memory.forget(this.chatId); return { text: 'Done - everything I had saved about you is deleted. Memory is OFF.' }; }
    if (low.startsWith('/findvideo')) {
      const need = t.slice(10).trim().slice(0, 200);
      this.mem({ type: 'need', keys: videoCompare.parseNeed(need, this.chapterId).criteria.map((x) => x.key) });
      const r = await videoSearch.find({ chapterId: this.chapterId, need, lang: this.lang || null });
      return { text: videoSearch.formatForChat(r) };
    }
    if (low.startsWith('/language')) {
      const l = videoSearch.parseLang(t.slice(9));
      if (!l) return { text: 'Which language for videos? /language english, hindi, hinglish or marathi' };
      this.lang = l; this.mem({ type: 'lang', lang: l });
      return { text: `OK, I'll look for ${l} videos (judged from the video title only). Use /findvideo <what you need>.` };
    }
    if (low.startsWith('/compare')) {
      const parts = t.slice(8).trim().split(/\s+/);
      const links = parts.filter((p) => /^https?:\/\//i.test(p)).slice(0, 2);
      const need = parts.filter((p) => !/^https?:\/\//i.test(p)).join(' ');
      if (links.length < 2) return { text: 'Send two YouTube links and what you need, e.g.\n/compare <link1> <link2> fastest revision for exam\n(I rank by YOUR need: fast revision, exam answers, full syllabus, clear concepts, or a topic name.)' };
      this.mem({ type: 'need', keys: videoCompare.parseNeed(need, this.chapterId).criteria.map((x) => x.key) });
      const r = await videoCompare.compare(links[0], links[1], this.chapterId, need);
      return { text: videoCompare.formatForChat(r) };
    }
    if (low.startsWith('/videos')) {
      const ch = this.chapter();
      const pl = playlist(ch.chapterId, t.slice(7).trim());
      return { text: formatForChat(`Ch.${ch.number} ${ch.title}`, pl) };
    }
    if (low.startsWith('/doubt')) {
      const d = t.slice(6).trim();
      if (!d) return { text: 'Type your doubt after /doubt - e.g. /doubt exothermic kya hota hai' };
      return this.doDoubt(d);
    }
    if (low.startsWith('/plan')) {
      const days = parseInt(low.split(' ')[1], 10) || 7;
      const plan = await module4.makePlan(String(this.chatId), days, {}, []);
      const lines = plan.schedule.map((d) => `Day ${d.day}: ${d.chapters.join(' + ')}`);
      // follow-up reminder: next study slot tomorrow morning
      this.revisionQueue.push({ label: 'PLAN Day 1', questionId: null, due: Date.now() + 24 * 60 * 60 * 1000, planDay: 1, plan });
      return { text: `${plan.summary}\n\n${lines.join('\n')}\n\nSKIP: ${plan.skip.map((c) => c.name).join(', ') || 'nothing - enough days!'}\n\nI'll check in on your plan daily.` };
    }

    if (this.mode === 'extra' && this.extraId) {
      const r = exemplar.check(this.extraId, t);
      if (r && !r.valid) return { text: exemplar.formatResult(r) };
      const id = this.extraId; this.mode = null; this.extraId = null;
      if (r) this.mem(r.correct ? { type: 'strong', questionId: id } : { type: 'weak', questionId: id });
      return { text: exemplar.formatResult(r) };
    }
    if (this.mode === 'extrashort' && this.extraShortId) {
      const r = exemplar.short.grade(this.extraShortId, t);
      if (r && r.tooShort) return { text: exemplar.short.formatResult(r) };
      const id = this.extraShortId; this.mode = null; this.extraShortId = null;
      if (r) this.mem(r.score / r.maxScore < 0.5 ? { type: 'weak', questionId: id } : { type: 'strong', questionId: id });
      return { text: exemplar.short.formatResult(r) };
    }
    // state: answering a quiz question
    if (this.mode === 'quiz' && this.questionId) {
      const q = findQuestion(this.questionId).question;
      this.mode = null; this.questionId = null;
      const r = await gradeAnswer(q, t);
      this.goals.grade = true;
      this.lastScore = r.score / r.maxScore;
      this.level = this.lastScore < 0.5 ? 'beginner' : 'intermediate';
      const missingIdx = r.points.map((p, i) => (p.status === 'missing' ? i : -1)).filter((i) => i >= 0);
      const repeatLine = sm.repeatNote(this.chatId, q.id, missingIdx);
      this.mem(this.lastScore < 0.5 ? { type: 'weak', questionId: q.id } : this.lastScore >= 1 ? { type: 'strong', questionId: q.id } : { type: 'topic', chapter: this.chapterId, topic: 'quiz' });
      if (missingIdx.length) this.mem({ type: 'missed', questionId: q.id, points: missingIdx });
      const missing = r.points.filter((p) => p.status === 'missing');
      if (missing.length) {
        this.revisionQueue.push({ label: q.text.slice(0, 60), questionId: q.id, due: Date.now() + 10 * 60 * 1000 });
      }
      const missed = missing.map((p) => `- ${p.point}\n  missing keywords: ${p.missingKeywords.join(', ')}`).join('\n');
      const prev = this.best[q.id];
      let funLine;
      if (r.score >= r.maxScore) { funLine = 'FULL MARKS! Board-ready answer, seriously.'; this.improveStreak += 1; }
      else if (prev !== undefined && r.score > prev) { funLine = `Up from ${prev}!${this.improveStreak >= 1 ? ` Improvement streak: ${this.improveStreak + 1}` : ''}`; this.improveStreak += 1; }
      else if (prev !== undefined && r.score === prev) { funLine = `Same as your best (${prev}). Beat it - add one missing keyword.`; this.improveStreak = 0; }
      else if (prev !== undefined) { funLine = `Below your best of ${prev} - reclaim it!`; this.improveStreak = 0; }
      else { funLine = 'Baseline set. Ab climb!'; }
      this.best[q.id] = Math.max(prev || 0, r.score);
      return {
        text: `Examiner says: ${r.score}/${r.maxScore}\n${funLine}\n\n${missed ? 'Missed points:\n' + missed + '\n\n' : ''}${r.notes.join('\n')}\n\nFull-mark answer:\n${r.modelAnswer}${missing.length ? '\n\n(Revision reminder set for ~10 min)' : ''}${repeatLine}`,
      };
    }

    // state: teaching the junior
    if (this.mode === 'teach' && this.topicId) {
      const r = await module3.explain(String(this.chatId), this.topicId, t, []);
      this.goals.teach = r.done;
      if (r.done) this.mode = null;
      return {
        text: `Understanding meter: ${r.meter}%\n\nJunior: ${r.juniorReply}${r.done ? '' : '\n\n(explain more - I am still confused about something)'}`,
      };
    }

    // default: coordinator routes free text - mostly doubts
    const trace = [];
    await coordinator.handle(String(this.chatId), t, trace);
    return this.doDoubt(t);
  }

  async doDoubt(d) {
    // keyword routing first; the student's active chapter is the fallback
    const ch = detectChapter(d) || this.chapter();
    const r = await answerDoubt(d, [], ch);
    this.mem({ type: 'topic', chapter: ch.chapterId, topic: topicKey(d, ch.chapterId) });
    this.goals.doubt = true;
    const out = { text: r.answer + '\n\n(Source: ' + (r.source || `NCERT Class 10 Science, Ch.${ch.number}`) + ')' };
    if (r.feedbackKey && r.answered) out.buttons = [[{ text: 'Helpful', data: `fb:${r.feedbackKey}:up` }, { text: 'Not helpful', data: `fb:${r.feedbackKey}:down` }]];
    if (r.card) out.photo = '/cards/' + r.card;
    return out;
  }

  // Proactive revision reminders - fired by the adapter's scheduler.
  dueReminders() {
    const now = Date.now();
    const due = this.revisionQueue.filter((r) => r.due <= now);
    this.revisionQueue = this.revisionQueue.filter((r) => r.due > now);
    return due.map((r) => r.planDay
      ? { text: `Plan check-in! Today's slots:\n${r.plan.timetable[Math.min(r.planDay - 1, r.plan.timetable.length - 1)].slots.map((s) => `${s.time} - ${s.label}`).join('\n')}\n\nDone a slot? Send /quiz when you're at the practice one.` }
      : { text: `Re-check time! Earlier you missed points on:\n"${r.label}..."\n\nSend /quiz to try a question again - checking before you forget is exactly when revision works best.` });
  }
}

module.exports = { ChatFlow };
