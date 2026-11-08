// Build-time verifier: takes hand-picked candidate ids (chosen from real search
// results) and keeps only those that verify live (oEmbed 200). Writes
// data/videos.json with title/channel/duration/chapter markers + verifiedOn.
const fs = require('fs');
const path = require('path');
const { fetchMeta } = require('../agents/video_meta');

// duration (minutes) comes from the build-time search listing (yt-dlp flat search)
const CANDIDATES = require('./playlist_candidates.json');

(async () => {
  const today = new Date().toISOString().slice(0, 10);
  const out = { verifiedOn: today, note: 'Videos verified live via YouTube oEmbed; chapter markers read from the public watch page. Transcripts are not available from servers, so coverage is judged from title, description and creator chapter markers.', chapters: {} };
  let ok = 0, bad = 0;
  for (const [ch, topics] of Object.entries(CANDIDATES)) {
    out.chapters[ch] = [];
    for (const t of topics) {
      const vids = [];
      for (const c of t.videos) {
        const m = await fetchMeta(c.id);
        if (!m.ok) { bad++; console.log('DROP', c.id, m.notes.join('; ')); continue; }
        ok++;
        vids.push({ id: c.id, url: `https://www.youtube.com/watch?v=${c.id}`, title: m.title, channel: m.channel, minutes: c.min, level: c.level || 'topic', markers: m.chapters.length, chapters: m.chapters.slice(0, 40), note: c.note || '' });
      }
      out.chapters[ch].push({ topic: t.topic, ncert: t.ncert, videos: vids });
    }
  }
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'videos.json'), JSON.stringify(out, null, 1));
  console.log(`verified ${ok}, dropped ${bad}`);
})();
