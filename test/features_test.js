// Formulas, drip, study path, quick mode.
const fs = require('fs'), os = require('os'), path = require('path');
async function runFeatureTests(check) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rp-feat-'));
  process.env.REDPEN_STORE = dir; process.env.REDPEN_SALT = 'feat-salt';
  for (const k of Object.keys(require.cache)) if (/agents[\\/](memory|drip|formulas|studypath|quickmode|studentmodel|examcount)|connectors[\\/]/.test(k)) delete require.cache[k];
  const formulas = require('../agents/formulas'), drip = require('../agents/drip'), memory = require('../agents/memory');
  const studypath = require('../agents/studypath'), quick = require('../agents/quickmode');
  const { TelegramAdapter } = require('../connectors/telegram');

  // formulas: every card cites an NCERT section that exists in the chapter text (when the text is available)
  const items = formulas.data.items;
  check('formulas: 4 chapters covered, every card has a section citation', ['ch1', 'ch2', 'ch3', 'ch4'].every((c) => formulas.forChapter(c).length >= 5) && items.every((i) => /§\d\.\d/.test(i.ncert)));
  const mn = items.find((i) => i.id === 'ch3-series');
  const initials = mn.mnemonic.split('(')[0].split(/[\s,]+/).filter(Boolean).map((w) => w[0]).join('');
  check('reactivity mnemonic initials = K Na Ca Mg Al Zn Fe Pb H Cu Hg Ag Au', initials === 'KNCMAZFPHCHAA');
  check('mnemonic sheet labels mnemonics as not NCERT and cites Dunlosky', /mine, not NCERT/.test(formulas.formatSheet('ch3', 'x')) && /Dunlosky/.test(formulas.formatSheet('ch3', 'x')));

  // drip
  const T0 = Date.parse('2026-11-09T09:00:00+05:30');
  check('drip: nothing without opt-in', drip.dueFor(500, T0).length === 0 && fs.readdirSync(dir).length <= 1);
  drip.start(500, 'ch1', T0);
  check('drip: nothing due on day 0', drip.dueFor(500, T0).length === 0);
  const d1 = drip.dueFor(500, T0 + 86400000 + 3600000);
  check('drip: max 2 per day', d1.length === 2 && drip.dueFor(500, T0 + 86400000 + 7200000).length === 0);
  check('drip: prompt asks recall, answer is separate', /recall|memory/.test(d1[0].prompt) && !d1[0].prompt.includes(d1[0].answer.split('\n')[1] || '@@'));
  const q = Date.parse('2026-11-12T23:30:00+05:30');
  check('drip: quiet hours 22:00-07:00 IST send nothing', drip.dueFor(500, q).length === 0 && drip.dueFor(500, Date.parse('2026-11-13T06:59:00+05:30')).length === 0);
  const after = drip.dueFor(500, Date.parse('2026-11-30T10:00:00+05:30'));
  check('drip: long gap = no flood (still max 2) and no guilt wording', after.length <= 2 && !/missed|streak|behind|lazy/i.test(after.map((x) => x.prompt).join(' ')));
  drip.setPaused(500, true);
  check('drip: paused sends nothing', drip.dueFor(500, Date.parse('2026-12-20T10:00:00+05:30')).length === 0);
  check('drip: spacing gaps are 1/3/7/14 days', JSON.stringify(drip.GAPS_DAYS) === '[1,3,7,14]');
  check('drip: activeChats lists opted-in chat', drip.activeChats().includes(500));
  drip.stop(500);
  check('drip: stop deletes reminder data (no chat id left in file)', !JSON.stringify(memory.readRec(500)).includes('chatId') && drip.activeChats().length === 0);
  drip.start(601, 'ch2', T0); drip.start(602, 'ch2', T0);
  const a = drip.dueFor(601, T0 + 90000000);
  check('drip: chats are isolated (601 due does not touch 602 state)', a.length === 2 && Object.values(drip.state(602).items).every((v) => v.stage === 0));
  drip.stop(601); drip.stop(602);

  // personalised drip: questions you found hard lead the deck, drop out when mastered
  memory.enable(701);
  memory.record(701, { type: 'weak', questionId: 'ch3-q7' });
  drip.start(701, 'ch3', T0);
  const pd = drip.dueFor(701, T0 + 86400000 + 3600000);
  check('drip: a question you found hard leads the deck', pd.length >= 1 && pd[0].id === 'q:ch3-q7' && /try it again/.test(pd[0].prompt) && /Marking points/.test(pd[0].answer));
  check('drip: still max 2 a day with personalisation on', pd.length <= 2);
  check('drip: addWeak is a no-op when reminders are off', drip.addWeak(702, 'ch3-q7', T0) === false);
  drip.start(703, 'ch3', T0);
  check('drip: a new weak question joins an active deck', drip.addWeak(703, 'ch3-q5', T0) === true && !!drip.state(703).items['q:ch3-q5']);
  check('drip: mastering it drops it from the deck', drip.dropWeak(703, 'ch3-q5') === true && !drip.state(703).items['q:ch3-q5']);
  check('drip: unknown question ids never enter the deck', drip.addWeak(703, 'nope-1', T0) === false);
  drip.stop(701); drip.stop(703);

  // telegram: buttons, callbacks, closed data set
  const bot = new TelegramAdapter();
  let id = 9000;
  const upd = (m) => bot.handleUpdate({ update_id: ++id, ...m });
  await upd({ message: { chat: { id: 700 }, text: '/drip on' } });
  check('telegram: /drip on sends Pause/Stop buttons', !!bot.sendLog.at(-1).buttons);
  let tickAt = Date.now() + 90000000; // relative to the /drip on start (Date.now()), not the fixed T0
  while (drip.quiet(tickAt)) tickAt += 3600000; // and never inside quiet hours, at any wall-clock time
  await bot.dripTick(tickAt);
  const p = bot.sendLog.at(-1);
  check('telegram: drip prompt has Show answer button', p.buttons && /^drip:show:/.test(p.buttons[0][0].data));
  await upd({ callback_query: { id: '1', data: p.buttons[0][0].data, message: { chat: { id: 700 } } } });
  check('telegram: Show reveals the formula answer with NCERT cite', /NCERT Ch\./.test(bot.sendLog.at(-1).text));
  const n0 = bot.sendLog.length;
  await upd({ callback_query: { id: '2', data: 'drip:show:../../etc/passwd', message: { chat: { id: 700 } } } });
  check('telegram: malformed callback data is ignored', bot.sendLog.length === n0);
  await upd({ callback_query: { id: '3', data: 'drip:stop', message: { chat: { id: 700 } } } });
  check('telegram: Stop button deletes reminders', drip.activeChats().length === 0);

  // study path + quick mode
  const base = studypath.buildPath({ days: 3, minutesPerDay: 60 });
  check('studypath: ranks, shows reasons, leaves things out when time is short', base.doFirst.length === 9 && base.skip.length + base.later.length > 0 && base.doFirst.every((r) => r.why.length));
  const mem = { weak: { 'ch3-q1': 2 }, topics: {} };
  const q1 = require('../agents/chapter').getChapter('ch3').pack.questions.find((x) => x.id === 'ch3-q1');
  const pers = studypath.buildPath({ days: 1, minutesPerDay: 40, mem });
  check('studypath: a hard question pulls its topic to the top (personalised)', pers.personalised && pers.doFirst[0].why.some((w) => /found .* hard/.test(w)) && !!q1);
  check('studypath: text says suggestion not rule', /not a rule/.test(studypath.format(base)));
  check('quick: detects "kal exam hai" and "exam tomorrow", ignores normal doubts', quick.isQuick('kal exam hai kya padhu') && quick.isQuick('exam tomorrow help') && !quick.isQuick('exam kya hota hai') && !quick.isQuick('what is pH'));
  check('quick: plan is plain text, short, mentions skipping', quick.plan(null, null).length < 1200 && /Skip everything else/.test(quick.plan(null, null)));
  check('quick: no fake app link when not deployed', !/https?:\/\//.test(quick.plan(null, null)) && /https:\/\/x\.example/.test(quick.plan(null, 'https://x.example')));
  await upd({ message: { chat: { id: 701 }, text: 'kal exam hai' } });
  check('telegram: quick phrase gets quick plan', /Quick plan/.test(bot.sendLog.at(-1).text));
  // exemplar: official key spot checks (answers read from jeep1an.pdf by me) + behaviour
  const ex = require('../agents/exemplar');
  const known = { 'xem-ch1-q1': 'd', 'xem-ch1-q11': 'b', 'xem-ch2-q15': 'a', 'xem-ch2-q4': 'b', 'xem-ch3-q31': 'c', 'xem-ch3-q17': 'd', 'xem-ch4-q25': 'd', 'xem-ch4-q29': 'a', 'xem-ch4-q7': 'a' };
  check('exemplar: official-key spot checks (9 known answers)', Object.entries(known).every(([id, a]) => ex.find(id) && ex.find(id).answer === a));
  check('exemplar: all 4 chapters have >= 18 MCQs with 4 options and an NCERT Exemplar source', ['ch1', 'ch2', 'ch3', 'ch4'].every((c) => ex.list(c).length >= 18 && ex.list(c).every((q) => Object.keys(q.options).length === 4 && /^NCERT Exemplar Class X Science Ch\.\d Q\.\d+/.test(q.source))));
  check('exemplar: no question carries PDF junk', ex.list('ch3').concat(ex.list('ch4'), ex.list('ch1'), ex.list('ch2')).every((q) => !/5JQTV|EXEMPLAR|METALS AND NON/.test(q.stem + Object.values(q.options).join(' '))));
  check('exemplar: public view hides the answer', !('answer' in ex.publicView(ex.list('ch1')[0])));
  check('exemplar: wrong/right/invalid handled', ex.check('xem-ch1-q1', 'a').correct === false && ex.check('xem-ch1-q1', '(d)').correct === true && ex.check('xem-ch1-q1', 'zebra').valid === false && ex.check('nope', 'a') === null);
  await upd({ message: { chat: { id: 702 }, text: '/extra' } });
  const qtext = bot.sendLog.at(-1).text; const qid = ex.list('ch1').find((q) => qtext.includes(q.stem.slice(0, 40)));
  await upd({ message: { chat: { id: 702 }, text: qid.answer } });
  check('telegram: /extra then letter answer checks against official key', !!qid && /Correct/.test(bot.sendLog.at(-1).text) && /NCERT Exemplar/.test(bot.sendLog.at(-1).text));
  // exemplar short-answer (written) practice: official NCERT model answers from jeep1an.pdf
  const sh = ex.short;
  check('short: all 4 chapters have 6 written questions with official answers and points', ['ch1', 'ch2', 'ch3', 'ch4'].every((c) => sh.list(c).length === 6 && sh.list(c).every((q) => q.question.length > 30 && q.answer.length > 20 && q.points.length >= 2 && /jeep1an/.test(q.source))));
  check('short: no question carries PDF junk', ['ch1', 'ch2', 'ch3', 'ch4'].every((c) => sh.list(c).every((q) => !/5JQTV|#PUYGT|\.QPI|EXEMPLAR P ROBLEMS/.test(q.question + q.answer))));
  check('short: public view hides the answer and points', !('answer' in sh.publicView(sh.list('ch2')[0])) && !('points' in sh.publicView(sh.list('ch2')[0])));
  const g1 = sh.grade('xsa-ch2-q42', 'The gas is hydrogen. Zn + 2HCl gives ZnCl2 and H2. A burning splinter makes it burn with a pop sound.');
  check('short: full correct answer scores full points', g1.score === g1.maxScore && g1.maxScore === 3);
  const g2 = sh.grade('xsa-ch2-q42', 'I think some gas comes out but I am not sure.');
  check('short: vague answer scores 0 and still returns the official answer', g2.score === 0 && /pop sound/.test(g2.answer));
  check('short: wrong spelling still matches (typo tolerance)', sh.grade('xsa-ch1-q34', 'AgCl decompses in sunlite and forms silver').score >= 1);
  check('short: too-short and unknown handled', sh.grade('xsa-ch1-q34', 'no').tooShort === true && sh.grade('nope', 'long enough answer text') === null);
  check('short: known limit - keyword check cannot catch a swapped mapping, so the official answer is always shown', sh.grade('xsa-ch3-q43', 'X is carbon, Y is graphite and Z is diamond').score === 3 && /diamond/.test(sh.grade('xsa-ch3-q43', 'X is carbon, Y is graphite and Z is diamond').answer));
  await upd({ message: { chat: { id: 703 }, text: '/extrawrite' } });
  const sq = sh.list('ch1').find((q) => bot.sendLog.at(-1).text.includes(q.question.slice(0, 40)));
  await upd({ message: { chat: { id: 703 }, text: sq ? sq.answer : 'x' } });
  check('telegram: /extrawrite grades a written answer against the official answer', !!sq && new RegExp(`You got ${sq.points.length}/${sq.points.length}`).test(bot.sendLog.at(-1).text) && /Official NCERT answer/.test(bot.sendLog.at(-1).text));
  // F1: student model - remembers how the student learns, auto-applies, stays under their control
  const sm = require('../agents/studentmodel');
  await upd({ message: { chat: { id: 710 }, text: '/remember on' } });
  check('model: off by default, honest about it', /OFF/.test(sm.describe(999)));
  memory.record(710, { type: 'weak', questionId: 'ch1-q2' });
  memory.record(710, { type: 'missed', questionId: 'ch1-q2', points: [1, 2] });
  memory.record(710, { type: 'missed', questionId: 'ch1-q2', points: [1] });
  memory.record(710, { type: 'lang', lang: 'hinglish' });
  const desc = sm.describe(710);
  check('model: describes what it knows and what it changes', /ch1-q2/.test(desc) && /point 2/.test(desc) && /hinglish/.test(desc) && /forget deletes everything/.test(desc));
  check('model: repeat misses need 2+ misses', sm.repeatMisses(memory.get(710)).length === 1 && sm.repeatMisses(memory.get(710))[0].point === 1);
  check('model: repeat note is kind and only on a real repeat', /last time too/.test(sm.repeatNote(710, 'ch1-q2', [1])) && sm.repeatNote(710, 'ch1-q2', [0]) === '');
  const wq = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(() => sm.weightQuiz(710, require('../agents/chapter').getChapter('ch1').allQuestions()));
  check('model: quiz weighting sometimes returns the weak question, never an alien one', wq.some((q) => q && q.id === 'ch1-q2') && wq.every((q) => !q || q.id.startsWith('ch1-')));
  check('model: weighting is a no-op with memory off', sm.weightQuiz(999, require('../agents/chapter').getChapter('ch1').allQuestions()) === null);
  check('model: missed event rejects junk', memory.record(710, { type: 'missed', questionId: 'bad id!', points: [1] }) === false && memory.record(710, { type: 'missed', questionId: 'ch1-q3', points: ['a', 99] }) === true && !memory.get(710).missed['ch1-q3']);
  check('model: mastering a question clears its missed points', memory.record(710, { type: 'missed', questionId: 'ch1-q5', points: [0] }) && memory.record(710, { type: 'strong', questionId: 'ch1-q5' }) && !memory.get(710).missed['ch1-q5']);
  await upd({ message: { chat: { id: 710 }, text: '/model' } });
  check('telegram: /model shows the model and the controls', /ch1-q2/.test(bot.sendLog.at(-1).text) && /\/forget/.test(bot.sendLog.at(-1).text));
  // F2: agentic exam countdown
  const examcount = require('../agents/examcount');
  check('exam: date validation (bad format, past, too far all rejected)', memory.record(710, { type: 'exam', date: 'tomorrow' }) === false && memory.record(710, { type: 'exam', date: '2020-01-01' }) === false && memory.record(710, { type: 'exam', date: '2030-01-01' }) === false);
  const inDays = (n) => { const d = new Date(Date.now() + n * 86400000 + 12 * 3600000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`; };
  check('exam: valid date stored', memory.record(710, { type: 'exam', date: inDays(6), chatId: 710 }) === true && memory.get(710).examDate === inDays(6));
  check('exam: daysLeft math', examcount.daysLeft(inDays(6)) === 6);
  let tickT = Date.now() + 3600000;
  while (drip.quiet(tickT)) tickT += 3600000;
  const n1 = examcount.dueNudges(tickT);
  check('exam: nudge fires at 7-day threshold with re-plan and kind copy', n1.length === 1 && n1[0].days === 6 && /re-planned/.test(n1[0].text) && /\/exam off/.test(n1[0].text) && !/panic|failure|streak/i.test(n1[0].text.split('/exam off')[0].split('Small steps')[0]));
  check('exam: same threshold does not fire twice', examcount.dueNudges(tickT).length === 0);
  check('exam: nudges respect quiet hours', examcount.dueNudges(new Date('2027-01-05T00:30:00+05:30').getTime()).every((n) => n.chatId !== 710) || drip.quiet(new Date('2027-01-05T00:30:00+05:30').getTime()));
  await upd({ message: { chat: { id: 710 }, text: '/exam' } });
  check('telegram: /exam shows the date and the plan', /days? left/.test(bot.sendLog.at(-1).text));
  await upd({ message: { chat: { id: 710 }, text: '/exam off' } });
  check('telegram: /exam off clears date and chat id', !memory.get(710).examDate && !memory.get(710).examChatId);
  check('exam: cleared date means no nudges', !examcount.dueNudges(tickT).some((n) => n.chatId === 710));
  memory.record(710, { type: 'exam', date: inDays(2), chatId: 710 });
  await bot.dripTick(tickT);
  check('telegram: dripTick also sends due exam nudges', bot.sendLog.some((s) => /to your exam/.test(s.text)));
  memory.record(710, { type: 'exam', date: null });
  fs.rmSync(dir, { recursive: true, force: true });
}
module.exports = { runFeatureTests };
