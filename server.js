// Red Pen - dependency-free Node server (Node 18+)
// Serves the app and the grading API. No login, no database: answers are
// processed in memory and never stored (per the security checklist).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { gradeAnswer } = require('./agents/module1');
const { playlist } = require('./agents/playlist');
const videoCompare = require('./agents/video_compare');
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
};

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

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

  // static files, no path traversal
  let p = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  if (p === '/' || p === '\\') p = '/index.html';
  const file = path.join(PUBLIC, p);
  if (!file.startsWith(PUBLIC)) return send(res, 403, '{}');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, JSON.stringify({ error: 'Not found' }));
    send(res, 200, data, MIME[path.extname(file)] || 'application/octet-stream');
  });
});

server.listen(PORT, () => console.log(`Red Pen running at http://localhost:${PORT}`));
