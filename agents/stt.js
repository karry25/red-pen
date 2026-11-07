// Groq Whisper speech-to-text for Telegram voice-note doubts.
// INERT without GROQ_API_KEY (vault-approved, env-only). Free tier hosts
// whisper-large-v3, which handles Hindi/Hinglish well. Mock-tested only
// until the real key arrives - see test/brain_mock.js.
//
// Flow: Telegram voice message -> getFile bytes -> transcribe() -> the
// text enters the normal Shy-Doubt pipeline, so voice doubts get the same
// NCERT-referenced answers as typed ones.

async function transcribe(buffer, filename = 'voice.oga') {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null; // no key: caller keeps the "type it instead" path
  const base = process.env.GROQ_BASE_URL || 'https://api.groq.com';
  const form = new FormData();
  form.append('file', new Blob([buffer]), filename);
  form.append('model', 'whisper-large-v3');
  form.append('response_format', 'json');
  const res = await fetch(`${base}/openai/v1/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Groq STT ${res.status}`);
  const j = await res.json();
  return j.text || '';
}

module.exports = { transcribe };
