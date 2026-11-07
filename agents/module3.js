// Module 3 - Teach-the-Junior: 2 agents with an honest meter.
//   Junior: plays the confused learner. Never grades; only asks the next
//     follow-up about what is still missing, and "gets it" only when the
//     Assessor says every key point is covered.
//   Assessor: an independent grader. Scores the student's explanation
//     against the topic's key points (same keyword tool as Module 1).
//     The understanding meter IS the Assessor's coverage - never vibes.
const { Agent } = require('./base');
const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'teach_topics.json'), 'utf8'));

const junior = new Agent({
  name: 'Junior',
  role: 'You are a curious but confused Class 9 student. The user teaches you. You never pretend to understand: ask a follow-up about exactly what is still missing. When everything is clear, celebrate honestly.',
});

const assessor = new Agent({
  name: 'Assessor',
  role: 'You grade the student\'s explanation against the topic\'s key points, like an examiner. Your coverage score is the Junior\'s understanding meter. Be strict: half-covered is half-understood.',
});

// Session state: which points of which topic are already covered.
const progress = new Map(); // sessionId:topicId -> Set(covered point indexes)

function norm(s) { return String(s || '').toLowerCase(); }

function topicById(id) { return data.topics.find((t) => t.id === id); }

function listTopics() {
  return data.topics.map((t) => ({ id: t.id, name: t.name, juniorOpening: t.juniorOpening }));
}

function getState(sessionId, topicId) {
  const key = `${sessionId}:${topicId}`;
  if (!progress.has(key)) progress.set(key, new Set());
  return progress.get(key);
}

async function explain(sessionId, topicId, explanation, trace) {
  const topic = topicById(topicId);
  if (!topic) return { error: 'Unknown topic.' };
  const covered = getState(sessionId, topicId);
  const text = norm(explanation);

  // Assessor grades the new explanation against ALL points (explanations
  // can cover earlier-missed points too).
  const graded = await assessor.act(trace, `checking the explanation against ${topic.points.length} key points`, async () =>
    topic.points.map((p, i) => {
      const hit = p.keywords.every((group) => group.some((alt) => text.includes(norm(alt))));
      return { i, hit };
    })
  );

  const newlyCovered = graded.filter((g) => g.hit && !covered.has(g.i)).map((g) => g.i);
  newlyCovered.forEach((i) => covered.add(i));
  assessor.remember({ topicId, covered: covered.size, of: topic.points.length });

  const meter = Math.round((covered.size / topic.points.length) * 100);
  const missingIdx = topic.points.map((_, i) => i).filter((i) => !covered.has(i));

  const juniorReply = await junior.act(trace, missingIdx.length ? 'still confused - asking about the missing part' : 'understood it fully!', async () => {
    if (!missingIdx.length) return topic.gotIt;
    // follow-up targets the FIRST missing point (honest: it is really missing)
    return topic.followUps[missingIdx[0]] || topic.followUps[0];
  });
  junior.remember({ topicId, meter });

  return {
    topicId,
    meter,                 // 0-100, = assessor coverage. Honest by construction.
    delta: newlyCovered.length,
    coveredPoints: [...covered].map((i) => topic.points[i].text),
    missingPoints: missingIdx.map((i) => topic.points[i].text),
    juniorReply,
    done: missingIdx.length === 0,
    agents: [assessor.name, junior.name],
    engine: 'rule-based agent brains (no AI key used yet)',
  };
}

module.exports = { listTopics, explain, agents: { junior, assessor } };
