// Telegram adapter for Red Pen. Free tier: long polling (no webhook,
// no hosting/domain needed - runs anywhere Node runs, even a laptop).
//
// Token comes ONLY from the TELEGRAM_BOT_TOKEN env var (vault-approved).
// Without a token this module never starts polling; use the simulator
// (test/simulate_telegram.js) which exercises the exact same code path.
const { ChatFlow } = require('./chat_flows');
const { Limiter, DailyCap } = require('../lib/limits');
const MAX_FLOWS = 3000;           // memory cap: oldest idle flows are dropped (opt-in memory files restore the essentials)
const HEAVY_RE = /^(\/(doubt|compare|findvideo|teach|plan|quiz)\b|[^/])/i; // free text and the LLM-ish commands

const API = 'https://api.telegram.org';

class TelegramAdapter {
  constructor(token = process.env.TELEGRAM_BOT_TOKEN) {
    this.token = token;
    this.flows = new Map(); // chatId -> ChatFlow (memory only)
    this.offset = 0;
    this.running = false;
    this.sendLog = [];       // test hook: messages the bot "sent"
    this.reminderIntervalMs = 60 * 1000;
    this.msgLimit = new Limiter({ rate: 0.5, burst: 6 });      // 30 messages/min sustained per chat
    this.heavyLimit = new Limiter({ rate: 0.1, burst: 4 });    // ~6 heavy requests/min per chat
    this.heavyDay = new DailyCap({ max: 120 });
    this.warnedAt = new Map();                                  // chat -> last 'slow down' notice (at most 1 per 30s)
    this.seen = new Set(); this.chains = new Map();             // update dedupe + per-chat ordering
    this.active = 0; this.maxActive = 8; this.stats = { handled: 0, limited: 0, dupes: 0, dropped: 0 };
    this.sendQ = []; this.sending = false; this.lastSend = new Map();
  }

  flowFor(chatId) {
    if (!this.flows.has(chatId)) {
      if (this.flows.size >= MAX_FLOWS) this.flows.delete(this.flows.keys().next().value);
      this.flows.set(chatId, new ChatFlow(chatId));
    }
    return this.flows.get(chatId);
  }

  async send(chatId, text, buttons) {
    this.sendLog.push({ chatId, text, buttons });
    if (!this.token) return; // simulation mode: log only
    await this.tgPost('sendMessage', {
      chat_id: chatId, text: String(text).slice(0, 4000), ...(buttons ? { reply_markup: { inline_keyboard: buttons.map((r) => r.map((b) => ({ text: b.text, callback_data: b.data }))) } } : {}),
    });
  }

  // Telegram allows ~1 message/sec per chat and ~30/sec overall; on 429 wait retry_after and try again (max 2 retries).
  async tgPost(method, payload) {
    for (let i = 0; i < 3; i++) {
      const gap = 1100 - (Date.now() - (this.lastSend.get(payload.chat_id) || 0));
      if (gap > 0 && gap < 1100 && this.paceSends) await new Promise((r) => setTimeout(r, gap));
      this.lastSend.set(payload.chat_id, Date.now());
      if (this.lastSend.size > 5000) this.lastSend.delete(this.lastSend.keys().next().value);
      const res = await fetch(`${API}/bot${this.token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.status !== 429) return res;
      const j = await res.json().catch(() => ({}));
      await new Promise((r) => setTimeout(r, Math.min(30, (j.parameters && j.parameters.retry_after) || 2) * 1000));
    }
  }

  // Entry for webhook/polling: dedupe, per-chat rate limits, per-chat ordering, bounded concurrency.
  async enqueue(update) {
    if (update.update_id !== undefined) {
      if (this.seen.has(update.update_id)) { this.stats.dupes++; return; }
      this.seen.add(update.update_id); if (this.seen.size > 2000) this.seen.delete(this.seen.values().next().value);
    }
    const m = update.message || (update.callback_query && update.callback_query.message);
    const chatId = m && m.chat && m.chat.id;
    if (chatId === undefined) return;
    const text = update.message && update.message.text ? update.message.text : (update.message && update.message.voice ? 'voice' : '');
    const verdict = this.admit(chatId, text);
    if (verdict) { this.stats.limited++; if (verdict.notice) await this.send(chatId, verdict.notice); return; }
    const prev = this.chains.get(chatId) || Promise.resolve();
    const next = prev.then(async () => {
      while (this.active >= this.maxActive) await new Promise((r) => setTimeout(r, 25));
      this.active++;
      try { await this.handleUpdate(update); this.stats.handled++; } catch { this.stats.dropped++; } finally { this.active--; }
    });
    this.chains.set(chatId, next);
    next.finally(() => { if (this.chains.get(chatId) === next) this.chains.delete(chatId); });
    return next;
  }
  admit(chatId, text, now = Date.now()) {
    const note = (msg) => { const last = this.warnedAt.get(chatId) || 0; if (now - last < 30000) return {}; this.warnedAt.set(chatId, now); if (this.warnedAt.size > 5000) this.warnedAt.delete(this.warnedAt.keys().next().value); return { notice: msg }; };
    const a = this.msgLimit.take(chatId, now);
    if (!a.ok) return note('Whoa, lots of messages at once - give me a few seconds and send again.');
    if (HEAVY_RE.test(text || 'voice')) {
      const h = this.heavyLimit.take(chatId, now);
      if (!h.ok) return note(`I'm still catching up - try again in about ${h.retryAfterSec}s.`);
      if (!this.heavyDay.take(chatId, now)) return note('That is a lot of questions for one day on the free plan. Free limits reset at midnight IST - /formulas, /extra and /videos still work any time.');
    }
    return null;
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
    const fb = /^fb:([a-z0-9:_.-]{1,80}):(up|down)$/i.exec(d);
    if (fb) { const r = require('../agents/feedback').rate(`tg${chatId}`, fb[1], fb[2]); return this.send(chatId, r.ok ? 'Thanks - this is anonymous and helps me fix weak answers.' : (r.why === 'already_rated' ? 'You already rated this one - thanks!' : 'Could not save that rating.')); }
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
      this.enqueue(u).catch(() => {});
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
