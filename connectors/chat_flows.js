// Chat flows for the Telegram connector (token-free, fully testable).
// One ChatFlow per chat: a tiny state machine over the SAME agents the
// web app uses. Channel-agnostic: Telegram is the first adapter; the
// flow only ever sees {chatId, text} and returns {text, ...} replies.
const { gradeAnswer } = require('../agents/module1');
const { answerDoubt } = require('../agents/module2');
const module3 = require('../agents/module3');
const module4 = require('../agents/module4');
const coordinator = require('../agents/coordinator');
const fs = require('fs');
const path = require('path');

const questions = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'questions.json'), 'utf8'));
const mostAsked = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'most_asked.json'), 'utf8'));

const WELCOME = `Hi! I'm Red Pen - practise like the examiner.

/quiz - get a board question, I grade your answer like a real examiner
/doubt <your doubt> - ask anything, no judgement (Hinglish chalega)
/teach - teach me a topic, my understanding meter shows if YOU got it
/plan <days> - ruthless revision plan from past-paper weightage
/goals - today's small study goals

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
  }

  // Beginner gets shorter questions first; repeat-verified PYQs come early.
  pickQuestion() {
    const pyqPool = mostAsked.questions.filter((q) => q.repeated);
    if (pyqPool.length && Math.random() < 0.6) return pyqPool[Math.floor(Math.random() * pyqPool.length)];
    const pool = [...questions.questions].sort((a, b) =>
      this.level === 'beginner' ? a.marks - b.marks : b.marks - a.marks);
    return pool[Math.floor(Math.random() * Math.min(3, pool.length))];
  }

  async handle(text) {
    const t = String(text || '').trim();
    const low = t.toLowerCase();

    if (low === '/start' || low === 'hi' || low === 'hello') return { text: WELCOME };
    if (low === '/most') {
      const lines = mostAsked.questions.map((q, i) =>
        `${i + 1}. (${q.marks}m, ${q.source.split(',')[0].replace('CBSE Sample Paper ', 'SQP ')})${q.repeated ? ' [REPEATED]' : ''} ${q.text.split('(')[0].slice(0, 90)}`);
      return { text: 'Most-asked from official CBSE sample papers:\n\n' + lines.join('\n\n') + '\n\nType /quiz to practise - repeated ones come first.' };
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
      const topics = module3.listTopics();
      const pick = topics[Math.floor(Math.random() * topics.length)];
      this.mode = 'teach'; this.topicId = pick.id;
      return { text: `OK, you are the teacher now!\n\n${pick.juniorOpening}\n\n(Topic: ${pick.name}) - explain in your own words.` };
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
      const q = questions.questions.find((x) => x.id === this.questionId)
        || mostAsked.questions.find((x) => x.id === this.questionId);
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
    const r = await answerDoubt(d, []);
    this.goals.doubt = true;
    const out = { text: r.answer + '\n\n(Source: ' + (r.source || 'NCERT Class 10 Science, Ch.1') + ')' };
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
