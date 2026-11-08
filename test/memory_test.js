// Memory + privacy tests. Uses a temp store dir; never touches real data.
const fs = require('fs');
const os = require('os');
const path = require('path');

async function runMemoryTests(check) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rp-mem-'));
  process.env.REDPEN_STORE = dir; process.env.REDPEN_SALT = 'test-salt';
  for (const k of Object.keys(require.cache)) if (/agents[\\/]memory|connectors[\\/](chat_flows|telegram)/.test(k)) delete require.cache[k];
  const memory = require('../agents/memory');
  const { TelegramAdapter } = require('../connectors/telegram');
  const bot = new TelegramAdapter();
  let id = 1000;
  const say = async (chat, text) => { await bot.handleUpdate({ update_id: ++id, message: { message_id: id, chat: { id: chat }, text } }); return bot.sendLog.at(-1).text; };
  const files = () => fs.readdirSync(dir).filter((f) => f.endsWith('.json'));

  const w = await say(11, '/start');
  check('welcome states memory is opt-in and may reset on free host', /\/remember on/.test(w) && /may reset/.test(w));
  await say(11, 'micelle kya hai');
  check('no memory written without opt-in', files().length === 0);
  check('/mydata when off says nothing saved', /nothing saved/.test(await say(11, '/mydata')));

  check('/remember on confirms', /Memory ON/.test(await say(11, '/remember on')));
  check('one hashed file created, name is not the chat id', files().length === 1 && !files()[0].includes('11') === true && /^[0-9a-f]{64}\.json$/.test(files()[0]));
  await say(11, '/chapter 4'); await say(11, 'micelle kya hai'); await say(11, '/language hindi');
  await say(11, '/quiz'); await say(11, 'idk');
  const raw = fs.readFileSync(path.join(dir, files()[0]), 'utf8');
  check('saved file contains no message text', !/micelle kya hai/i.test(raw) && !/idk/.test(raw));
  const rec = JSON.parse(raw);
  check('saved topic, chapter, language, weak question', rec.chapter === 'ch4' && rec.lang === 'hindi' && Object.keys(rec.topics).some((k) => k.startsWith('ch4:')) && Object.keys(rec.weak).length === 1);
  const md = await say(11, '/mydata');
  check('/mydata lists the saved fields + 90-day rule', /ch4/.test(md) && /hindi/.test(md) && /90 days/.test(md));

  // isolation: another chat sees nothing of chat 11
  await say(22, '/start');
  check('chat 22 /mydata shows nothing (no cross-user access)', /nothing saved/.test(await say(22, '/mydata')));
  await say(22, '/remember on'); await say(22, '/language marathi');
  const md22 = await say(22, '/mydata');
  check('chat 22 sees only its own data', /marathi/.test(md22) && !/hindi/.test(md22) && !/ch4/.test(md22));
  check('two opted-in chats = two separate files', files().length === 2);
  check('user text cannot choose a file: "/mydata 11" still only returns own data', !/hindi/.test(await say(22, '/mydata 11')));
  check('memory.record rejects free text and unknown events', memory.record(11, { type: 'topic', chapter: 'ch1', topic: '../../etc/passwd' }) === true && !JSON.stringify(memory.get(11)).includes('passwd') && memory.record(11, { type: 'weird' }) === false);

  // restore after "restart": a fresh adapter loads prefs for chat 11 only
  const bot2 = new TelegramAdapter();
  await bot2.handleUpdate({ update_id: 1, message: { message_id: 1, chat: { id: 11 }, text: '/start' } });
  const f2 = bot2.flows.get(11);
  check('prefs restored for the same chat after restart', f2.lang === 'hindi' && f2.chapterId === 'ch4');
  check('prefs not applied to a different chat', !bot2.flows.get(33) && (await (async () => { await bot2.handleUpdate({ update_id: 2, message: { message_id: 2, chat: { id: 33 }, text: '/start' } }); const g = bot2.flows.get(33); return g.lang === null && g.chapterId === 'ch1'; })()));

  // expiry
  const f11 = memory.fileFor(11);
  const old = JSON.parse(fs.readFileSync(f11, 'utf8')); old.lastUsed = Date.now() - 91 * 86400000; fs.writeFileSync(f11, JSON.stringify(old));
  check('sweep deletes data idle for 91 days, keeps others', memory.sweep() === 1 && !fs.existsSync(f11) && fs.existsSync(memory.fileFor(22)));

  check('saved file is owner-only (0600)', (fs.statSync(memory.fileFor(22)).mode & 0o077) === 0);

  // forget
  check('/forget deletes everything', /deleted/.test(await say(22, '/forget')) && files().length === 0 && /nothing saved/.test(await say(22, '/mydata')));
  check('static server cannot serve the store (outside /public)', !memory.DIR.includes(`${path.sep}public`));
  fs.rmSync(dir, { recursive: true, force: true });
}
module.exports = { runMemoryTests };
