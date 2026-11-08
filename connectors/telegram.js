// Telegram adapter for Red Pen. Free tier: long polling (no webhook,
// no hosting/domain needed - runs anywhere Node runs, even a laptop).
//
// Token comes ONLY from the TELEGRAM_BOT_TOKEN env var (vault-approved).
// Without a token this module never starts polling; use the simulator
// (test/simulate_telegram.js) which exercises the exact same code path.
const { ChatFlow } = require('./chat_flows');

const API = 'https://api.telegram.org';

class TelegramAdapter {
  constructor(token = process.env.TELEGRAM_BOT_TOKEN) {
    this.token = token;
    this.flows = new Map(); // chatId -> ChatFlow (memory only)
    this.offset = 0;
    this.running = false;
    this.sendLog = [];       // test hook: messages the bot "sent"
    this.reminderIntervalMs = 60 * 1000;
  }

  flowFor(chatId) {
    if (!this.flows.has(chatId)) this.flows.set(chatId, new ChatFlow(chatId));
    return this.flows.get(chatId);
  }

  async send(chatId, text, buttons) {
    this.sendLog.push({ chatId, text, buttons });
    if (!this.token) return; // simulation mode: log only
    await fetch(`${API}/bot${this.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, ...(buttons ? { reply_markup: { inline_keyboard: buttons.map((r) => r.map((b) => ({ text: b.text, callback_data: b.data })) ) } } : {}) }),
    });
  }

  async sendPhoto(chatId, photoPath) {
    this.sendLog.push({ chatId, photo: photoPath });
    if (!this.token) return;
    // photoPath is served by the web app; live sending uses Telegram's URL form
    const base = process.env.PUBLIC_BASE_URL;
    if (!base) return;
    await fetch(`${API}/bot${this.token}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, photo: base + photoPath }),
    });
  }

  // One Telegram update (message) -> maybe replies. Same path in sim and live.
  async handleUpdate(update) {
    if (update.callback_query) return this.handleCallback(update.callback_query);
    const msg = update.message;
    if (!msg) return;
    const flow = this.flowFor(msg.chat.id);
    // Voice-note doubt: transcribe with Groq Whisper, then treat as typed.
    if (!msg.text && msg.voice) {
      const heard = await this.transcribeVoice(msg.voice);
      if (!heard) {
        await this.send(msg.chat.id, 'Got your voice note! Voice answers are not switched on yet (waiting on the free Groq key). Type the doubt for now?');
        return;
      }
      await this.send(msg.chat.id, `Heard: "${heard}"`);
      const reply = await flow.handle(heard.startsWith('/') ? heard : `/doubt ${heard}`);
      if (reply && reply.text) await this.send(msg.chat.id, reply.text);
      if (reply && reply.photo) await this.sendPhoto(msg.chat.id, reply.photo);
      return;
    }
    if (!msg.text) return;
    const reply = await flow.handle(msg.text);
    if (reply && reply.text) await this.send(msg.chat.id, reply.text, reply.buttons);
    if (reply && reply.photo) await this.sendPhoto(msg.chat.id, reply.photo);
  }

  // Inline-button taps. Data is a closed set; the chat id comes from Telegram, never from the button text.
  async handleCallback(cb) {
    const chatId = cb.message && cb.message.chat && cb.message.chat.id;
    if (!chatId) return;
    const drip = require('../agents/drip');
    const formulas = require('../agents/formulas');
    const d = String(cb.data || '');
    if (this.token) await fetch(`${API}/bot${this.token}/answerCallbackQuery`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callback_query_id: cb.id }) }).catch(() => {});
    if (d === 'drip:pause') { drip.setPaused(chatId, true); return this.send(chatId, 'Paused. /drip resume when you want them back.'); }
    if (d === 'drip:stop') { drip.stop(chatId); return this.send(chatId, 'Stopped. Reminder data deleted.'); }
    const m = /^drip:show:([a-z0-9-]{1,40})$/.exec(d);
    if (m) { const f = formulas.byId(m[1]); if (f) return this.send(chatId, `${f.title}\n${f.body}\n[${f.ncert}]`, [[{ text: 'Pause', data: 'drip:pause' }, { text: 'Stop', data: 'drip:stop' }]]); }
  }

  // Telegram getFile -> download bytes -> Whisper. Returns null when the
  // token or Groq key is missing (voice stays politely off).
  async transcribeVoice(voice) {
    if (!this.token || !process.env.GROQ_API_KEY) return null;
    const { transcribe } = require('../agents/stt');
    const f = await (await fetch(`${API}/bot${this.token}/getFile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_id: voice.file_id }),
    })).json();
    if (!f.ok) return null;
    const res = await fetch(`${API}/file/bot${this.token}/${f.result.file_path}`);
    const buf = Buffer.from(await res.arrayBuffer());
    return transcribe(buf, 'voice.oga');
  }

  // Proactive revision reminders for every known chat.
  async reminderTick() {
    for (const [chatId, flow] of this.flows) {
      for (const r of flow.dueReminders()) await this.send(chatId, r.text);
    }
    await this.dripTick();
  }

  // Spaced formula reminders for students who opted in (/drip on). Chat ids come from their own opt-in files.
  async dripTick(now = Date.now()) {
    const drip = require('../agents/drip');
    for (const chatId of drip.activeChats()) {
      for (const p of drip.dueFor(chatId, now)) await this.send(chatId, p.prompt, [[{ text: 'Show answer', data: `drip:show:${p.id}` }], [{ text: 'Pause', data: 'drip:pause' }, { text: 'Stop', data: 'drip:stop' }]]);
    }
  }

  async pollOnce() {
    const res = await fetch(`${API}/bot${this.token}/getUpdates?offset=${this.offset}&timeout=30`);
    const j = await res.json();
    for (const u of j.result || []) {
      this.offset = u.update_id + 1;
      await this.handleUpdate(u);
    }
  }

  async start() {
    if (!this.token) throw new Error('TELEGRAM_BOT_TOKEN not set - use the simulator for local testing.');
    this.running = true;
    setInterval(() => this.reminderTick().catch(() => {}), this.reminderIntervalMs);
    while (this.running) {
      try { await this.pollOnce(); } catch (e) { await new Promise((r) => setTimeout(r, 3000)); }
    }
  }

  stop() { this.running = false; }
}

module.exports = { TelegramAdapter };

if (require.main === module) {
  const a = new TelegramAdapter();
  console.log('Red Pen Telegram bot polling...');
  a.start();
}
