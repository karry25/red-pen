// Formulas, drip, study path, quick mode.
const fs = require('fs'), os = require('os'), path = require('path');
async function runFeatureTests(check) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rp-feat-'));
  process.env.REDPEN_STORE = dir; process.env.REDPEN_SALT = 'feat-salt';
  for (const k of Object.keys(require.cache)) if (/agents[\\/](memory|drip|formulas|studypath|quickmode)|connectors[\\/]/.test(k)) delete require.cache[k];
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

  // telegram: buttons, callbacks, closed data set
  const bot = new TelegramAdapter();
  let id = 9000;
  const upd = (m) => bot.handleUpdate({ update_id: ++id, ...m });
  await upd({ message: { chat: { id: 700 }, text: '/drip on' } });
  check('telegram: /drip on sends Pause/Stop buttons', !!bot.sendLog.at(-1).buttons);
  await bot.dripTick(T0 + 90000000);
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
  fs.rmSync(dir, { recursive: true, force: true });
}
module.exports = { runFeatureTests };
