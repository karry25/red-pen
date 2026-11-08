// Video metadata reader for Red Pen (free, no API key, no cookies, no login).
// Reads ONLY public YouTube pages: oEmbed (title/channel) and the public watch
// page (description + creator chapter markers). It does NOT read transcripts:
// YouTube blocks transcript downloads from server IPs, so we never claim to
// have "watched" a video. Security: only youtube.com / youtu.be ids are
// accepted, a strict 11-char id is extracted first, nothing else is fetched.

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

// Accepts a pasted link or a bare id; returns the 11-char id or null.
function parseVideoId(input) {
  const s = String(input || '').trim();
  if (ID_RE.test(s)) return s;
  let u;
  try { u = new URL(s); } catch { return null; }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'music.youtube.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else {
      const m = u.pathname.match(/^\/(?:shorts|embed|live)\/([^/?]+)/);
      if (m) id = m[1];
    }
  }
  return id && ID_RE.test(id) ? id : null;
}

function ts(t) { // "1:02:03" or "5:20" -> seconds
  const p = String(t).split(':').map(Number);
  if (p.some(Number.isNaN)) return null;
  return p.reduce((a, b) => a * 60 + b, 0);
}

function decodeJsonText(s) {
  try { return JSON.parse(`"${s}"`); } catch { return s; }
}

async function fetchWithTimeout(url, opts = {}, ms = 12000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctl.signal }); } finally { clearTimeout(t); }
}

// Returns { id, ok, title, channel, description, chapters:[{start,title}],
//           lastMarkerSec, confidence, notes[] }
async function fetchMeta(idOrUrl) {
  const id = parseVideoId(idOrUrl);
  if (!id) return { ok: false, error: 'not a valid YouTube video link' };
  const out = { id, ok: false, title: null, channel: null, description: '', chapters: [], lastMarkerSec: null, notes: [] };
  try {
    const r = await fetchWithTimeout(`https://www.youtube.com/oembed?url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}&format=json`);
    if (r.status === 200) {
      const j = await r.json();
      out.title = j.title; out.channel = j.author_name; out.ok = true;
    } else {
      out.notes.push(`oEmbed returned ${r.status} (private, removed or not embeddable)`);
      return out;
    }
  } catch (e) { out.notes.push('oEmbed unreachable: ' + e.name); return out; }

  try {
    const r = await fetchWithTimeout(`https://www.youtube.com/watch?v=${id}`, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en' },
    });
    const h = await r.text();
    const d = h.match(/"attributedDescription":\{"content":"(.*?)","commandRuns"/s);
    if (d) out.description = decodeJsonText(d[1]).slice(0, 4000);
    const titles = [...h.matchAll(/"macroMarkersListItemRenderer":\{"title":\{"simpleText":"(.*?)"\},"timeDescription":\{"simpleText":"([^"]+)"/g)];
    const seen = new Set();
    for (const m of titles) {
      const start = ts(m[2]);
      if (start == null || seen.has(start)) continue;
      seen.add(start);
      out.chapters.push({ start, title: decodeJsonText(m[1]) });
    }
    out.chapters.sort((a, b) => a.start - b.start);
    if (out.chapters.length) out.lastMarkerSec = out.chapters[out.chapters.length - 1].start;
    if (!out.chapters.length) out.notes.push('creator added no chapter markers');
    if (!out.description) out.notes.push('description not readable');
  } catch (e) { out.notes.push('watch page unreachable: ' + e.name); }
  return out;
}

module.exports = { parseVideoId, fetchMeta };
