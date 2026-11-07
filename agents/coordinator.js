// Red Pen Coordinator agent.
// One front door for the student: the Coordinator reads the message,
// routes it to the right module agent, shares session context between
// agents, and keeps one consistent chat. Channel-agnostic by design:
// the UI talks to it through the web today; a WhatsApp/Telegram adapter
// later implements the same {receive(text) -> reply} shape and plugs in.
const { Agent } = require('./base');
const { makeLlmBrain } = require('./brains');

const coordinator = new Agent({
  name: 'Coordinator',
  role: 'You are the friendly front desk of Red Pen. Understand what the student wants, hand the work to the right specialist agent (Examiner, Doubt, Junior, Triage), and keep the conversation consistent. Never answer subject questions yourself - route them.',
});

// Rule-based intent router (LLM brain drops in later via setBrain).
const ROUTES = [
  { module: 1, agent: 'Examiner', patterns: ['grade', 'check my answer', 'examiner', 'marks', 'marking'] },
  { module: 2, agent: 'Doubt', patterns: ['doubt', 'dout', 'samajh nahi', 'what is', 'why is', 'why does', 'explain', 'matlab', '?'] },
  { module: 3, agent: 'Junior', patterns: ['teach', 'junior', 'test me', 'let me explain'] },
  { module: 4, agent: 'Triage', patterns: ['days left', 'triage', 'plan', 'revision', 'what to study', 'skip'] },
];

function route(message) {
  const m = String(message || '').toLowerCase();
  for (const r of ROUTES) {
    if (r.patterns.some((p) => m.includes(p))) return r;
  }
  return { module: 2, agent: 'Doubt' }; // default: treat free text as a doubt
}

// Shared session context: one object per student session, all agents
// read/write through the coordinator so a chat channel can reuse it.
const sessions = new Map();
function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, { id: sessionId, created: new Date().toISOString(), attempts: [], doubts: [], plan: null });
  }
  return sessions.get(sessionId);
}

async function handle(sessionId, message, trace) {
  const session = getSession(sessionId);
  const r = await coordinator.act(trace, `reading your message and routing it to the right agent`, async () => route(message));
  coordinator.remember({ sessionId, routedTo: r.agent });
  return { routedTo: r, session };
}

module.exports = { coordinator, handle, getSession };

// Brain upgrade path: if a free Gemini/Groq key is set in the environment
// (vault-approved), agents get an LLM brain; otherwise rule-based stays.
{
  const brain = makeLlmBrain();
  if (brain) coordinator.setBrain(brain);
}
