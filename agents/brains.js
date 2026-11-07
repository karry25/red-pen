// Pluggable LLM brains. INERT until a key exists in the environment.
// Keys come only from the vault-approved env var (never the repo, never
// the frontend). Until then every agent keeps its rule-based brain.
//
// Prompt-injection posture (per security checklist): student text is sent
// as DATA with the marking scheme, never as instructions; the role stays
// in the system prompt; output is treated as untrusted text on return.

function activeBrainInfo() {
  if (process.env.GEMINI_API_KEY) return { provider: 'gemini', ready: true };
  if (process.env.GROQ_API_KEY) return { provider: 'groq', ready: true };
  return { provider: null, ready: false };
}

async function callGemini(systemPrompt, userText) {
  const key = process.env.GEMINI_API_KEY;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 800 },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const j = await res.json();
  return j.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callGroq(systemPrompt, userText) {
  const key = process.env.GROQ_API_KEY;
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.3,
      max_tokens: 800,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userText },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}`);
  const j = await res.json();
  return j.choices?.[0]?.message?.content || '';
}

// One entry point: returns a brain function for an agent, or null (keep
// the rule-based brain) when no key is configured.
function makeLlmBrain() {
  const info = activeBrainInfo();
  if (!info.ready) return null;
  const call = info.provider === 'gemini' ? callGemini : callGroq;
  return async ({ role, context }) => call(role, context);
}

module.exports = { makeLlmBrain, activeBrainInfo };
