// Playlist agent: serves only videos that were verified live at build time.
const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, '..', 'data', 'videos.json');
let cache = null;
function load() { if (!cache) cache = JSON.parse(fs.readFileSync(FILE, 'utf8')); return cache; }

function playlist(chapterId, topicQuery) {
  const d = load();
  const topics = d.chapters[chapterId];
  if (!topics) return { available: false, verifiedOn: d.verifiedOn, topics: [] };
  const q = String(topicQuery || '').toLowerCase().trim();
  let sel = topics;
  if (q) {
    const words = q.split(/\s+/).filter((w) => w.length >= 2);
    const scored = topics.map((t) => ({ t, s: words.reduce((a, w) => a + (t.topic.toLowerCase().includes(w) ? 1 : 0), 0) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
    sel = scored.length ? scored.map((x) => x.t) : [];
  }
  return { available: true, verifiedOn: d.verifiedOn, note: d.note, topics: sel.map((t) => ({ topic: t.topic, ncert: t.ncert, videos: t.videos.map(({ chapters, ...v }) => v) })) };
}

function topicNames(chapterId) { return (load().chapters[chapterId] || []).map((t) => t.topic); }
function formatForChat(chapterTitle, pl) {
  if (!pl.available) return `I don't have a verified playlist for ${chapterTitle} yet. I only list videos I've actually checked.`;
  if (!pl.topics.length) return 'No verified playlist for that topic yet. Try /videos with no topic to see what I have.';
  const lines = pl.topics.map((t) => `${t.topic} (${t.ncert})\n` + t.videos.map((v) => `- ${v.channel}, ${v.minutes} min${v.markers ? `, ${v.markers} chapter markers` : ''}\n  ${v.title.slice(0, 70)}\n  ${v.url}`).join('\n'));
  return `${chapterTitle} - videos (links checked ${pl.verifiedOn}; I judge by title/channel, I have not watched them):\n\n${lines.join('\n\n')}`;
}
module.exports = { playlist, topicNames, formatForChat };
