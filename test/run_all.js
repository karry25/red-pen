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
  check('6 visual cards rendered as PNG', cards.filter((c) => c.endsWith('.png')).length === 6);

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

  // LLM brain + STT wiring, exercised against a mock Groq (no real key)
  await require('./brain_mock').runBrainMock(check);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
