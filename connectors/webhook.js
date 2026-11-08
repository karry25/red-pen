// Telegram webhook endpoint (free-host friendly: no long polling, so the host can sleep and wake on the next message).
// The URL path contains a random secret AND Telegram's secret-token header is checked, so random callers can't inject updates.
const crypto = require('crypto');
const { TelegramAdapter } = require('./telegram');
let adapter = null;
const getAdapter = () => { if (!adapter) { adapter = new TelegramAdapter(); global.__botStats = () => ({ ...adapter.stats, flows: adapter.flows.size, active: adapter.active }); } return adapter; };
const eq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

function handle(req, res, send) {
  const want = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!eq(req.headers['x-telegram-bot-api-secret-token'] || '', want)) return send(res, 401, '{}');
  let body = '';
  req.on('data', (c) => { body += c; if (body.length > 100_000) req.destroy(); });
  req.on('end', () => {
    let update;
    try { update = JSON.parse(body); } catch { return send(res, 400, '{}'); }
    send(res, 200, '{}');                       // answer Telegram immediately; work happens after
    getAdapter().enqueue(update).catch(() => {});
  });
}
module.exports = { handle, getAdapter };
