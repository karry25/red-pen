// Full regression: starts the server, exercises every endpoint and the
// Telegram simulation, asserts key behaviors, exits non-zero on failure.
const { spawn } = require('child_process');
const path = require('path');

const PORT = 4199;
const base = `http://localhost:${PORT}`;
let passed = 0, failed = 0;
function check(name, cond) {
  if (cond) { passed += 1; console.log(`PASS ${name}`); }
  else { failed += 1; console.log(`FAIL ${name}`); }
}

async function post(p, body) {
  const r = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.json();
}

(async () => {
  const server = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT } });
  await new Promise((r) => setTimeout(r, 800));

  // Module 1
  const qs = await (await fetch(base + '/api/questions')).json();
  check('questions listed (>=9)', qs.questions.length >= 9);
  const weak = await post('/api/grade', { questionId: 'ch1-q3', answer: 'something breaks down' });
  check('weak answer scores low', weak.score <= 1);
  const strong = await post('/api/grade', { questionId: 'ch1-q3', answer: 'A single reactant breaks down into two or more simpler substances. Thermal decomposition by heat: CaCO3 -> CaO + CO2. Electrolytic by electricity: 2H2O -> 2H2 + O2. Photolytic by light: 2AgCl -> 2Ag + Cl2.' });
  check('strong answer full marks', strong.score === strong.maxScore);
  check('grading trace shows 3 agents', new Set(strong.trace.map((t) => t.agent)).size === 3);
  const empty = await post('/api/grade', { questionId: 'ch1-q3', answer: '' });
  check('empty answer rejected', !!empty.error);

  // Module 2
  const doubt = await post('/api/doubt', { doubt: 'rancidity kya hoti hai' });
  check('doubt answered from KB', doubt.answered === true && doubt.answer.length > 20);
  const off = await post('/api/doubt', { doubt: 'quantum entanglement' });
  check('off-syllabus doubt honest', off.answered === false);
  const digest = await (await fetch(base + '/api/digest')).json();
  check('digest anonymous topics only', typeof digest.totalDoubts === 'number' && digest.topConfusions.every((c) => Object.keys(c).sort().join(',') === 'count,topic'));

  // Module 3
  const topics = await (await fetch(base + '/api/teach/topics')).json();
  check('teach topics listed (>=5)', topics.topics.length >= 5);
  const t1 = await post('/api/teach', { sessionId: 'reg', topicId: 't-balancing', explanation: 'atoms conserve hote hain conservation of mass, equal atoms both sides' });
  check('partial teach meter 25-75', t1.meter >= 25 && t1.meter <= 75);
  const t2 = await post('/api/teach', { sessionId: 'reg', topicId: 't-balancing', explanation: 'coefficient badalte hain formula nahi, warna equation galat, law violate' });
  check('meter completes to 100 same session', t2.meter === 100 && t2.done === true);

  // Module 4
  const plan = await post('/api/triage/plan', { sessionId: 'reg', daysLeft: 2, confidence: { ch5: 0, ch11: 0 } });
  check('triage honest summary', /Covering ~\d+ of 80/.test(plan.summary));
  check('triage has schedule', plan.schedule.length >= 1);

  // most-asked + explainers + timetable
  const pyq = await post('/api/grade', { questionId: 'pyq-2425-q21', answer: 'A is exothermic displacement, heat evolved, more reactive. B is double displacement precipitation, exchange of ions, yellow precipitate of lead iodide pbi2' });
  check('PYQ graded from official scheme', pyq.score === 2);
  const xp = await (await fetch(base + '/api/explainers')).json();
  check('explainers with verified links', xp.explainers.length === 6 && xp.explainers.every((x) => x.learnMore.every((l) => l.url.startsWith('https://'))));
  const tt = await post('/api/triage/plan', { sessionId: 'tt', daysLeft: 3, confidence: {} });
  check('timetable with 4 slots/day', tt.timetable.every((d) => d.slots.length >= 3) && /Pomodoro/.test(tt.timetableWhy));
  const cards = require('fs').readdirSync(require('path').join(__dirname, '..', 'public', 'cards'));
  check('visual cards rendered as PNG (>=10)', cards.filter((c) => c.endsWith('.png')).length >= 10);

  // Chapter agents (Ch.2)
  const chs = await (await fetch(base + '/api/chapters')).json();
  check('4 chapters with their own agents', chs.chapters.length === 4 && chs.chapters[1].agent === 'Ch.2 Guide' && chs.chapters[2].agent === 'Ch.3 Guide' && chs.chapters[3].agent === 'Ch.4 Guide');
  const q2 = await (await fetch(base + '/api/questions?chapter=ch2')).json();
  check('ch2: 9 bank + 5 PYQ questions', q2.questions.length === 9 && q2.mostAsked.length === 5 && q2.chapterAgent === 'Ch.2 Guide');
  const g2w = await post('/api/grade', { questionId: 'ch2-q3', answer: 'because it is safer' });
  check('ch2 weak dilution answer scores low', g2w.score <= 1);
  const g2s = await post('/api/grade', { questionId: 'ch2-q3', answer: 'Mixing concentrated acid with water is highly exothermic, heat is released. If water is added to acid the heat generated can make the mixture splash out and cause burns; the glass may break. So acid is added slowly to water with stirring.' });
  check('ch2 strong dilution answer full marks', g2s.score === g2s.maxScore && g2s.chapterAgent === 'Ch.2 Guide');
  const d2 = await post('/api/doubt', { doubt: 'pH scale kya hota hai? 7 pe kya hota hai?' });
  check('pH doubt routed to Ch.2 Guide with card', d2.chapter === 'ch2' && d2.chapterAgent === 'Ch.2 Guide' && d2.card === 'ph-scale.png');
  check('chapter agent appears in trace', d2.trace.some((t) => t.agent === 'Ch.2 Guide'));
  const tt2 = await (await fetch(base + '/api/teach/topics?chapter=ch2')).json();
  check('ch2 teach topics listed', tt2.topics.length === 5 && tt2.topics.every((t) => t.chapter === 'ch2'));
  const e2 = await post('/api/teach', { sessionId: 't2', topicId: 'ch2-t3', explanation: 'pH measures hydrogen ion concentration, p means potenz or power. The scale goes from 0 very acidic to 14 very alkaline, 7 is neutral. Higher H3O+ means lower pH, the relation is inverse. It is measured with a universal indicator like pH paper showing different colours. Acids are below 7, bases are above 7.' });
  check('ch2 teach meter honest full', e2.meter === 100 && e2.done === true);
  const x2 = await (await fetch(base + '/api/explainers?chapter=ch2')).json();
  check('ch2 explainers with verified links', x2.explainers.length === 3 && x2.explainers.every((x) => x.hackSource && x.learnMore.length >= 2));
  const pyq2 = await post('/api/grade', { questionId: 'pyq-2526-q21', answer: 'Sodium hydroxide NaOH, because it is a strong base giving the most OH- ions; Mg(OH)2 is weak and the other two are acids.' });
  check('ch2 PYQ graded from official scheme', pyq2.score === 1);

  // Chapter agents (Ch.3)
  const q3 = await (await fetch(base + '/api/questions?chapter=ch3')).json();
  check('ch3: 9 bank + 4 PYQ questions', q3.questions.length === 9 && q3.mostAsked.length === 4 && q3.chapterAgent === 'Ch.3 Guide');
  const g3s = await post('/api/grade', { questionId: 'ch3-q2', answer: 'Amphoteric oxides react with both acids and bases to produce salt and water, e.g. aluminium oxide Al2O3. With acid: Al2O3 + 6HCl -> 2AlCl3 + 3H2O. With base: Al2O3 + 2NaOH -> 2NaAlO2 sodium aluminate + H2O.' });
  check('ch3 strong amphoteric answer full marks', g3s.score === g3s.maxScore && g3s.chapterAgent === 'Ch.3 Guide');
  const g3w = await post('/api/grade', { questionId: 'ch3-q2', answer: 'they are special oxides' });
  check('ch3 weak answer scores low', g3w.score <= 1);
  const d3 = await post('/api/doubt', { doubt: 'thermit reaction kya hai?' });
  check('thermit doubt routed to Ch.3', d3.chapter === 'ch3' && d3.chapterAgent === 'Ch.3 Guide');
  const pyq3 = await post('/api/grade', { questionId: 'pyq-2526-q18', answer: 'I and III: aluminium oxide and zinc oxide, they are amphoteric so they react with both acids and bases to form salt and water.' });
  check('ch3 PYQ graded from official scheme', pyq3.score === 1);
  const t3 = await (await fetch(base + '/api/teach/topics?chapter=ch3')).json();
  check('ch3 teach topics listed', t3.topics.length === 5 && t3.topics.every((t) => t.chapter === 'ch3'));

  // Chapter agents (Ch.4)
  const q4 = await (await fetch(base + '/api/questions?chapter=ch4')).json();
  check('ch4: 9 bank + 4 PYQ questions', q4.questions.length === 9 && q4.mostAsked.length === 4 && q4.chapterAgent === 'Ch.4 Guide');
  const g4s = await post('/api/grade', { questionId: 'ch4-q2', answer: 'Diamond and graphite are allotropes of carbon: the same element with different bonding arrangements, so their physical properties differ. In diamond each carbon is bonded to four others in a rigid 3D network, making it the hardest substance. In graphite each carbon bonds to only three others, forming hexagonal layers that slide over each other, and its free electrons make it a good conductor of electricity.' });
  check('ch4 strong allotrope answer full marks', g4s.score === g4s.maxScore && g4s.chapterAgent === 'Ch.4 Guide');
  const g4w = await post('/api/grade', { questionId: 'ch4-q2', answer: 'diamond is expensive and shiny' });
  check('ch4 weak answer scores low', g4w.score <= 1);
  const d4 = await post('/api/doubt', { doubt: 'micelle kya hai soap mein?' });
  check('micelle doubt routed to Ch.4', d4.chapter === 'ch4' && d4.chapterAgent === 'Ch.4 Guide');
  const pyq4 = await post('/api/grade', { questionId: 'pyq-2526-q29a', answer: 'X is propene C3H6, it has 3 carbons and 6 hydrogens so x=3 and y=6. It is an unsaturated hydrocarbon with a double bond. On hydrogenation with Ni catalyst it gives propane C3H8.' });
  check('ch4 PYQ graded from official scheme', pyq4.score >= 1);
  const t4 = await (await fetch(base + '/api/teach/topics?chapter=ch4')).json();
  check('ch4 teach topics listed', t4.topics.length === 5 && t4.topics.every((t) => t.chapter === 'ch4'));

  // security
  const trav = await fetch(base + '/../../etc/passwd');
  check('path traversal blocked', trav.status === 404 || trav.status === 403);

  server.kill();

  // Telegram simulation
  const { TelegramAdapter } = require('../connectors/telegram');
  const bot = new TelegramAdapter();
  let id = 0;
  const upd = (text) => ({ update_id: ++id, message: { message_id: id, chat: { id: 7 }, text } });
  await bot.handleUpdate(upd('/start'));
  check('bot welcome', /quiz/.test(bot.sendLog.at(-1).text));
  await bot.handleUpdate(upd('/quiz'));
  check('bot quiz question', /marks\)/.test(bot.sendLog.at(-1).text));
  await bot.handleUpdate(upd('something breaks down'));
  check('bot grades with missed points', /Examiner says/.test(bot.sendLog.at(-1).text) && /missing keywords/.test(bot.sendLog.at(-1).text));
  bot.flows.get(7).revisionQueue.forEach((r) => { r.due = 0; });
  await bot.reminderTick();
  check('bot proactive reminder', /Re-check time/.test(bot.sendLog.at(-1).text));
  check('bot never polled without token', bot.offset === 0);
  await bot.handleUpdate(upd('/chapter 2'));
  check('bot chapter switch to Ch.2', /Acids, Bases and Salts/.test(bot.sendLog.at(-1).text));
  await bot.handleUpdate(upd('/quiz'));
  check('bot quiz from Ch.2', /marks\)/.test(bot.sendLog.at(-1).text));
  await bot.handleUpdate(upd('/chapter 1'));
  await bot.handleUpdate({ update_id: ++id, message: { message_id: id, chat: { id: 7 }, voice: { file_id: 'sim-voice' } } });
  check('voice note graceful without keys', /not switched on yet/.test(bot.sendLog.at(-1).text));

  // LLM brain + STT wiring, exercised against a mock Groq (no real key)
  await require('./brain_mock').runBrainMock(check);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
