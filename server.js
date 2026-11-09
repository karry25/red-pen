// Red Pen - dependency-free Node server (Node 18+)
// Serves the app and the grading API. No login, no database: answers are
// processed in memory and never stored (per the security checklist).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { gradeAnswer } = require('./agents/module1');
const { playlist } = require('./agents/playlist');
const videoCompare = require('./agents/video_compare');
const videoSearch = require('./agents/video_search');
const { answerDoubt, teacherDigest } = require('./agents/module2');
const coordinator = require('./agents/coordinator');
const module3 = require('./agents/module3');
const module4 = require('./agents/module4');

const PORT = process.env.PORT || 4173;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const { getChapter, listChapters, findQuestion, detectChapter } = require('./agents/chapter');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

const { guard, counters: guardCounters } = require('./lib/guard');
const zlib = require('zlib');
const gz = new Map(); // path -> gzipped bytes (static files only; bounded by number of files)
const MAX_CONN = Number(process.env.MAX_CONNECTIONS || 200);

const server = http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { return send(res, 400, '{}'); }
  if (guard(req, res, url.pathname)) return;

  if (req.method === 'GET' && url.pathname === '/healthz') {
    const g = require('./lib/llmgate').snapshot();
    return send(res, 200, JSON.stringify({ ok: true, uptimeSec: Math.round(process.uptime()), rssMB: Math.round(process.memoryUsage().rss / 1048576), cpuSec: +((process.cpuUsage().user + process.cpuUsage().system) / 1e6).toFixed(3), llm: g, limiter: guardCounters, bot: global.__botStats ? global.__botStats() : null }));
  }
  if (req.method === 'POST' && process.env.TELEGRAM_WEBHOOK_SECRET && url.pathname === `/telegram/${process.env.TELEGRAM_WEBHOOK_SECRET}`) {
    return require('./connectors/webhook').handle(req, res, send);
  }

  if (req.method === 'GET' && url.pathname === '/api/chapters') {
    return send(res, 200, JSON.stringify({ chapters: listChapters() }));
  }

  if (req.method === 'GET' && url.pathname === '/api/questions') {
    const ch = getChapter(url.searchParams.get('chapter') || 'ch1');
    const list = ch.questions.map((q) => ({ id: q.id, text: q.text, marks: q.marks }));
    const pyq = ch.pyqs.map((q) => ({ id: q.id, text: q.text, marks: q.marks, source: q.source, repeated: q.repeated, repeatNote: q.repeatNote }));
    return send(res, 200, JSON.stringify({ chapter: `Ch.${ch.number}: ${ch.title}`, chapterId: ch.chapterId, chapterAgent: ch.name, questions: list, mostAsked: pyq, mostAskedNote: 'Verified from official CBSE sample papers (cbseacademic.nic.in), answers cross-checked with the official marking scheme. REPEATED only when the pattern appears in more than one paper.' }));
  }

  if (req.method === 'POST' && url.pathname === '/api/grade') {
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 50_000) req.destroy(); // basic abuse guard
    });
    req.on('end', () => {
      try {
        const { questionId, answer } = JSON.parse(body || '{}');
        const found = findQuestion(questionId);
        if (!found) return send(res, 400, JSON.stringify({ error: 'Unknown question.' }));
        if (!answer || !String(answer).trim()) return send(res, 400, JSON.stringify({ error: 'Answer is empty.' }));
        gradeAnswer(found.question, answer)
          .then((r) => { r.chapter = found.chapter.chapterId; r.chapterAgent = found.chapter.name; r.chapterSource = found.chapter.source; send(res, 200, JSON.stringify(r)); })
          .catch((e) => send(res, 500, JSON.stringify({ error: String(e) })));
      } catch {
        return send(res, 400, JSON.stringify({ error: 'Bad request.' }));
      }
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/doubt') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 20_000) req.destroy(); });
    req.on('end', () => {
      try {
        const { doubt, sessionId, chapterId } = JSON.parse(body || '{}');
        if (!doubt || !String(doubt).trim()) return send(res, 400, JSON.stringify({ error: 'Doubt is empty.' }));
        const trace = [];
        const ch = chapterId ? getChapter(chapterId) : (detectChapter(doubt) || getChapter('ch1'));
        coordinator.handle(sessionId || 'anon', doubt, trace)
          .then(() => answerDoubt(doubt, trace, ch))
          .then((r) => { r.trace = trace; send(res, 200, JSON.stringify(r)); })
          .catch((e) => send(res, 500, JSON.stringify({ error: String(e) })));
      } catch { send(res, 400, JSON.stringify({ error: 'Bad request.' })); }
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/videos') {
    const ch = getChapter(url.searchParams.get('chapter') || 'ch1');
    return send(res, 200, JSON.stringify({ chapterId: ch.chapterId, chapter: `Ch.${ch.number}: ${ch.title}`, ...playlist(ch.chapterId, url.searchParams.get('topic') || '') }));
  }

  if (req.method === 'GET' && url.pathname === '/api/explainers') {
    const ch = getChapter(url.searchParams.get('chapter') || 'ch1');
    return send(res, 200, JSON.stringify({ chapterId: ch.chapterId, chapter: `Ch.${ch.number}: ${ch.title}`, explainers: ch.explainers }));
  }

  if (req.method === 'GET' && url.pathname === '/api/digest') {
    const trace = [];
    teacherDigest(trace).then((r) => { r.trace = trace; send(res, 200, JSON.stringify(r)); });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/teach/topics') {
    return send(res, 200, JSON.stringify({ topics: module3.listTopics(url.searchParams.get('chapter') || null) }));
  }

  if (req.method === 'POST' && url.pathname === '/api/teach') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 20_000) req.destroy(); });
    req.on('end', () => {
      try {
        const { topicId, explanation, sessionId } = JSON.parse(body || '{}');
        if (!explanation || !String(explanation).trim()) return send(res, 400, JSON.stringify({ error: 'Explanation is empty.' }));
        module3.explain(sessionId || 'anon', topicId, explanation, [])
          .then((r) => send(res, r.error ? 400 : 200, JSON.stringify(r)))
          .catch((e) => send(res, 500, JSON.stringify({ error: String(e) })));
      } catch { send(res, 400, JSON.stringify({ error: 'Bad request.' })); }
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/triage/chapters') {
    const triageData = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'triage.json'), 'utf8'));
    return send(res, 200, JSON.stringify({ chapters: triageData.chapters, note: triageData.note, diagnostic: module4.diagnosticChapters().map((c) => c.id) }));
  }

  if (req.method === 'POST' && url.pathname === '/api/triage/plan') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 20_000) req.destroy(); });
    req.on('end', () => {
      try {
        const { sessionId, daysLeft, confidence } = JSON.parse(body || '{}');
        module4.makePlan(sessionId || 'anon', daysLeft, confidence || {}, [])
          .then((r) => send(res, 200, JSON.stringify(r)))
          .catch((e) => send(res, 500, JSON.stringify({ error: String(e) })));
      } catch { send(res, 400, JSON.stringify({ error: 'Bad request.' })); }
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/videos/find') {
    const ch = getChapter(url.searchParams.get('chapter') || 'ch1');
    videoSearch.find({ chapterId: ch.chapterId, need: (url.searchParams.get('need') || '').slice(0, 200), lang: (url.searchParams.get('lang') || '').toLowerCase() || null })
      .then((r) => send(res, r.ok ? 200 : 502, JSON.stringify(r)))
      .catch(() => send(res, 500, JSON.stringify({ error: 'Search failed.' })));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/compare') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 5_000) req.destroy(); });
    req.on('end', async () => {
      try {
        const { a, b, chapter, need } = JSON.parse(body || '{}');
        const ch = getChapter(chapter || 'ch1');
        const r = await videoCompare.compare(a, b, ch.chapterId, need || '');
        send(res, r.ok ? 200 : 400, JSON.stringify(r));
      } catch { send(res, 400, JSON.stringify({ error: 'Bad request.' })); }
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/exemplar') {
    const ex = require('./agents/exemplar');
    const ch = getChapter(url.searchParams.get('chapter') || 'ch1');
    const q = ex.pick(ch.chapterId, (url.searchParams.get('seen') || '').split(',').slice(0, 40));
    return send(res, 200, JSON.stringify(q ? { question: ex.publicView(q), count: ex.list(ch.chapterId).length, note: ex.data.note } : { question: null }));
  }
  if (req.method === 'POST' && url.pathname === '/api/exemplar/check') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 2_000) req.destroy(); });
    req.on('end', () => {
      try {
        const { id, letter } = JSON.parse(body || '{}');
        const r = require('./agents/exemplar').check(String(id || ''), letter);
        if (!r || !r.valid) return send(res, 400, JSON.stringify({ error: 'Unknown question or choice.' }));
        send(res, 200, JSON.stringify(r));
      } catch { send(res, 400, JSON.stringify({ error: 'Bad request.' })); }
    });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/exemplar/short') {
    const ex = require('./agents/exemplar');
    const ch = getChapter(url.searchParams.get('chapter') || 'ch1');
    const q = ex.short.pick(ch.chapterId, (url.searchParams.get('seen') || '').split(',').slice(0, 40));
    return send(res, 200, JSON.stringify(q ? { question: ex.short.publicView(q), count: ex.short.list(ch.chapterId).length, note: ex.short.data.note } : { question: null }));
  }
  if (req.method === 'POST' && url.pathname === '/api/exemplar/short/grade') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 8_000) req.destroy(); });
    req.on('end', () => {
      try {
        const { id, answer } = JSON.parse(body || '{}');
        const r = require('./agents/exemplar').short.grade(String(id || ''), String(answer || ''));
        if (!r) return send(res, 400, JSON.stringify({ error: 'Unknown question.' }));
        send(res, 200, JSON.stringify(r));
      } catch { send(res, 400, JSON.stringify({ error: 'Bad request.' })); }
    });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/feedback') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 1_000) req.destroy(); });
    req.on('end', () => {
      try {
        const { key, value, sessionId } = JSON.parse(body || '{}');
        const r = require('./agents/feedback').rate(`web${String(sessionId || 'anon').slice(0, 40)}|${require('./lib/guard').clientKey(req)}`, key, value);
        send(res, r.ok ? 200 : 400, JSON.stringify(r.ok ? { ok: true } : { error: r.why }));
      } catch { send(res, 400, JSON.stringify({ error: 'Bad request.' })); }
    });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/formulas') {
    const ch = getChapter(url.searchParams.get('chapter') || 'ch1');
    return send(res, 200, JSON.stringify({ chapterId: ch.chapterId, items: require('./agents/formulas').forChapter(ch.chapterId), note: require('./agents/formulas').data.note }));
  }
  if (req.method === 'GET' && url.pathname === '/api/path') {
    const sp = require('./agents/studypath');
    const days = Math.max(1, Math.min(30, parseInt(url.searchParams.get('days'), 10) || 7));
    const mins = Math.max(20, Math.min(240, parseInt(url.searchParams.get('minutes'), 10) || 60));
    const p = sp.buildPath({ days, minutesPerDay: mins, mem: null });
    return send(res, 200, JSON.stringify({ ...p, text: sp.format(p) }));
  }
  if (req.method === 'GET' && url.pathname === '/api/sources') {
    return send(res, 200, JSON.stringify(require('./data/citations.json')));
  }

  // static files, no path traversal
  let p = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  if (p === '/' || p === '\\') p = '/index.html';
  const file = path.join(PUBLIC, p);
  if (!file.startsWith(PUBLIC)) return send(res, 403, '{}');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, JSON.stringify({ error: 'Not found' }));
    const type = MIME[path.extname(file)] || 'application/octet-stream';
    const headers = { 'Content-Type': type, 'Cache-Control': /sw\.js$/.test(file) ? 'no-cache' : 'public, max-age=300' }; // static assets are cheap to cache at the browser
    if (/text|javascript|json|svg/.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
      if (!gz.has(file)) gz.set(file, zlib.gzipSync(data));
      headers['Content-Encoding'] = 'gzip'; headers['Vary'] = 'Accept-Encoding';
      res.writeHead(200, headers); return res.end(gz.get(file));
    }
    res.writeHead(200, headers); res.end(data);
  });
});

require('./agents/memory').sweep();
setInterval(() => require('./agents/memory').sweep(), 24 * 60 * 60 * 1000).unref();
server.maxConnections = MAX_CONN;
server.headersTimeout = 15000; server.requestTimeout = 30000; server.keepAliveTimeout = 5000;
server.listen(PORT, () => console.log(`Red Pen running at http://localhost:${PORT}`));
