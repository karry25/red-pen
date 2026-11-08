// Chat flows for the Telegram connector (token-free, fully testable).
// One ChatFlow per chat: a tiny state machine over the SAME agents the
// web app uses. Channel-agnostic: Telegram is the first adapter; the
// flow only ever sees {chatId, text} and returns {text, ...} replies.
const { gradeAnswer } = require('../agents/module1');
const videoCompare = require('../agents/video_compare');
const { playlist, formatForChat } = require('../agents/playlist');
const { answerDoubt } = require('../agents/module2');
const module3 = require('../agents/module3');
const module4 = require('../agents/module4');
const coordinator = require('../agents/coordinator');
const { getChapter, findQuestion, detectChapter, listChapters } = require('../agents/chapter');

const WELCOME = `Hi! I'm Red Pen, your study buddy - ask me a doubt or let me quiz you, examiner style.

/quiz - get a question, I grade your answer like a real examiner
/doubt <your doubt> - ask anything, no judgement (Hinglish chalega)
/teach - teach me a topic, my understanding meter shows if YOU got it
/plan <days> - revision plan from past-paper weightage
/goals - today's small study goals
/compare <link1> <link2> <your need> - which video suits you
/videos [topic] - checked video playlist for the active chapter
/chapter <1-4> - switch the chapter I'm working from

Right now my verified material covers NCERT Class 10 Science chapters 1-4 (Chemical Reactions, Acids-Bases-Salts, Metals & Non-metals, Carbon), with answers backed by the NCERT text and CBSE sample papers. More subjects coming - I'll always tell you honestly what I actually know.

Nothing you send is stored after I answer.`;

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
  }

  chapter() { return getChapter(this.chapterId); }

  // Beginner gets shorter questions first; repeat-verified PYQs come early.
  pickQuestion() {
    const ch = this.chapter();
    const pyqPool = ch.pyqs.filter((q) => q.repeated);
    if (pyqPool.length && Math.random() < 0.6) return pyqPool[Math.floor(Math.random() * pyqPool.length)];
    const pool = [...ch.questions].sort((a, b) =>
      this.level === 'beginner' ? a.marks - b.marks : b.marks - a.marks);
    return pool[Math.floor(Math.random() * Math.min(3, pool.length))];
  }

  async handle(text) {
    const t = String(text || '').trim();
    const low = t.toLowerCase();

    if (low === '/start' || low === 'hi' || low === 'hello') return { text: WELCOME };
    if (low === '/chapter' || low.startsWith('/chapter ')) {
      const n = low.split(' ')[1];
      const all = listChapters();
      if (!n) {
        return { text: `Chapters I can teach right now:\n${all.map((c) => `${c.number}. ${c.title}${c.id === this.chapterId ? '  <- active' : ''}`).join('\n')}\n\nSwitch with /chapter 2` };
      }
      const target = all.find((c) => String(c.number) === n || c.id === `ch${n}`);
      if (!target) return { text: `Chapter ${n} abhi available nahi hai. Available: ${all.map((c) => c.number).join(', ')}` };
      this.chapterId = target.id;
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
    if (low.startsWith('/compare')) {
      const parts = t.slice(8).trim().split(/\s+/);
      const links = parts.filter((p) => /^https?:\/\//i.test(p)).slice(0, 2);
      const need = parts.filter((p) => !/^https?:\/\//i.test(p)).join(' ');
      if (links.length < 2) return { text: 'Send two YouTube links and what you need, e.g.\n/compare <link1> <link2> fastest revision for exam\n(I rank by YOUR need: fast revision, exam answers, full syllabus, clear concepts, or a topic name.)' };
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

    // state: answering a quiz question
    if (this.mode === 'quiz' && this.questionId) {
      const q = findQuestion(this.questionId).question;
      this.mode = null; this.questionId = null;
      const r = await gradeAnswer(q, t);
      this.goals.grade = true;
      this.lastScore = r.score / r.maxScore;
      this.level = this.lastScore < 0.5 ? 'beginner' : 'intermediate';
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
        text: `Examiner says: ${r.score}/${r.maxScore}\n${funLine}\n\n${missed ? 'Missed points:\n' + missed + '\n\n' : ''}${r.notes.join('\n')}\n\nFull-mark answer:\n${r.modelAnswer}${missing.length ? '\n\n(Revision reminder set for ~10 min)' : ''}`,
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
    this.goals.doubt = true;
    const out = { text: r.answer + '\n\n(Source: ' + (r.source || `NCERT Class 10 Science, Ch.${ch.number}`) + ')' };
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
