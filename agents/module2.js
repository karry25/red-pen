// Module 2 - Shy-Doubt Companion: 2 agents.
//   Doubt agent: answers an anonymous doubt in simple Hinglish.
//     Rule-based brain today = retrieval over the Ch.1 FAQ knowledge base
//     (real answers, honestly scoped). LLM brain answers anything later.
//   Digest agent: the teacher view - counts which topics the batch asks
//     about most. Session memory only; no names, no storage.
const { Agent } = require('./base');
const { makeLlmBrain } = require('./brains');
const fs = require('fs');
const path = require('path');

const kb = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'doubts_kb.json'), 'utf8'));

const doubtAgent = new Agent({
  name: 'Doubt',
  role: 'You answer Class 10 Science doubts in simple Hinglish, like a patient friend. No judgement - the student asked anonymously because they were shy. Keep it short and clear.',
});

const digestAgent = new Agent({
  name: 'Digest',
  role: 'You summarise the batch\'s confusions for the teacher: which topics were asked most, how many doubts today. You never reveal who asked - doubts are anonymous.',
});

// In-memory anonymous counters (per server run; no student identity stored).
const topicCounts = new Map();
let totalDoubts = 0;

function norm(s) { return String(s || '').toLowerCase(); }

async function answerDoubt(doubtText, trace) {
  const text = norm(doubtText);

  const hit = await doubtAgent.act(trace, 'finding the best answer for this anonymous doubt', async () => {
    let best = null;
    let bestScore = 0;
    for (const e of kb.entries) {
      const score = e.keywords.reduce((s, k) => s + (text.includes(norm(k)) ? k.length : 0), 0);
      if (score > bestScore) { best = e; bestScore = score; }
    }
    return best;
  });

  totalDoubts += 1;
  if (hit) {
    const key = hit.question;
    topicCounts.set(key, (topicCounts.get(key) || 0) + 1);
    doubtAgent.remember({ matchedTopic: key });
    return {
      answered: true,
      topic: key,
      answer: hit.answer,
      source: hit.source || 'NCERT Class 10 Science, Ch.1',
      card: hit.card || null,
      anonymous: true,
      engine: 'FAQ retrieval over Ch.1 knowledge base (no AI key used yet)',
    };
  }

  doubtAgent.remember({ matchedTopic: null });
  topicCounts.set('(unmatched doubts)', (topicCounts.get('(unmatched doubts)') || 0) + 1);
  return {
    answered: false,
    answer: 'Good doubt! Mera rule-based brain is Chapter 1 ke faq tak limited hai, aur ye doubt usme cover nahi hai. AI key approve hone ke baad main koi bhi doubt answer kar paunga. Try: balancing, decomposition, exothermic, corrosion, rancidity...',
    anonymous: true,
    engine: 'FAQ retrieval over Ch.1 knowledge base (no AI key used yet)',
  };
}

async function teacherDigest(trace) {
  return digestAgent.act(trace, 'summarising the batch\'s top confusions (names hidden)', async () => {
    const top = [...topicCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    return {
      totalDoubts,
      topConfusions: top.map(([topic, count]) => ({ topic, count })),
      note: 'Anonymous by design: topics only, never who asked.',
    };
  });
}

module.exports = { answerDoubt, teacherDigest, agents: { doubtAgent, digestAgent } };

// Brain upgrade path: if a free Gemini/Groq key is set in the environment
// (vault-approved), agents get an LLM brain; otherwise rule-based stays.
{
  const brain = makeLlmBrain();
  if (brain) Object.values(module.exports.agents || {}).forEach((a) => a.setBrain(brain));
}
