// Local simulation of the Telegram connector - no token, no network.
// Feeds fake Telegram update objects through the REAL adapter code path
// and prints what the bot would send.
const { TelegramAdapter } = require('../connectors/telegram');

function update(chatId, text, id) {
  return { update_id: id, message: { message_id: id, chat: { id: chatId }, text } };
}

(async () => {
  const bot = new TelegramAdapter(); // no token -> simulation mode
  let n = 0;
  const say = async (chatId, text) => {
    await bot.handleUpdate(update(chatId, text, ++n));
    console.log(`\nSTUDENT> ${text}`);
    for (const m of bot.sendLog.slice(bot._printed || 0)) console.log(`BOT> ${m.text || '[PHOTO] ' + m.photo}`);
    bot._printed = bot.sendLog.length;
  };

  console.log('=== Telegram simulation (real adapter, fake updates) ===');
  await say(1001, '/start');
  await say(1001, '/doubt exothermic matlab kya hota hai?');
  await say(1001, '/quiz');
  // answer whatever question came back, deliberately incomplete
  await say(1001, 'it is when something breaks down into products');
  await say(1001, '/goals');
  await say(1001, '/plan 3');
  await say(1001, 'corrosion kya hota hai'); // free text -> coordinator -> doubt
  await say(1001, '/teach');
  await say(1001, 'ek reactant toot ke two or more products banata hai, thermal mein heat se CaCO3 tootta hai, electrolytic mein electricity se water, photolytic mein light se AgCl');

  // proactive reminder: force one revision item to be due and tick
  const flow = bot.flows.get(1001);
  flow.revisionQueue.forEach((r) => { r.due = Date.now() - 1; });
  await bot.reminderTick();
  const last = bot.sendLog[bot.sendLog.length - 1];
  console.log(`\nBOT (proactive reminder)> ${last.text}`);

  console.log(`\nlevel after quiz: ${flow.level} | goals: ${JSON.stringify(flow.goals)}`);
  console.log('=== simulation complete ===');
})();
