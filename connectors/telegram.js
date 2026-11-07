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

  async send(chatId, text) {
    this.sendLog.push({ chatId, text });
    if (!this.token) return; // simulation mode: log only
    await fetch(`${API}/bot${this.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
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
    const msg = update.message;
    if (!msg || !msg.text) return;
    const flow = this.flowFor(msg.chat.id);
    const reply = await flow.handle(msg.text);
    if (reply && reply.text) await this.send(msg.chat.id, reply.text);
    if (reply && reply.photo) await this.sendPhoto(msg.chat.id, reply.photo);
  }

  // Proactive revision reminders for every known chat.
  async reminderTick() {
    for (const [chatId, flow] of this.flows) {
      for (const r of flow.dueReminders()) await this.send(chatId, r.text);
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
