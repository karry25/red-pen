// Module 1 - Board-Examiner Mode: a 3-agent pipeline.
//   Keyword Checker -> Examiner -> Rewrite
// Hand-off: Keyword Checker extracts what the answer covers; the Examiner
// awards marks per marking-scheme point; Rewrite composes the model answer.
const { Agent } = require('./base');

const keywordChecker = new Agent({
  name: 'Keyword Checker',
  role: 'You check a student answer against the official CBSE marking scheme. For each marking point, decide which keyword groups are covered and which are missing. Never award marks yourself.',
});

const examiner = new Agent({
  name: 'Examiner',
  role: 'You are a strict but fair CBSE board examiner. Using the Keyword Checker report, award marks per point (half-marks allowed), never more than the point is worth, and write one-line examiner notes.',
});

const rewrite = new Agent({
  name: 'Rewrite',
  role: 'You write the full-mark model answer from the marking scheme, in simple words a Class 10 student could have written.',
});

function normalize(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Tool: keyword group matching (substring so student variants match)
function matchGroups(answer, points) {
  const norm = normalize(answer);
  return points.map((p) => {
    const groups = p.keywords.map((alts) => ({
      matched: alts.some((a) => norm.includes(normalize(a))),
      missing: alts[0],
    }));
    const matched = groups.filter((g) => g.matched).length;
    return { point: p, groups, matched, total: groups.length };
  });
}

async function gradeAnswer(question, answerText) {
  const trace = [];

  const coverage = await keywordChecker.act(trace, 'checking your answer against the marking scheme keywords', async () =>
    matchGroups(answerText, question.points)
  );
  keywordChecker.remember({ questionId: question.id });

  const scored = await examiner.act(trace, `awarding marks for ${question.points.length} marking points`, async () =>
    coverage.map((c) => {
      const fraction = c.total ? c.matched / c.total : 0;
      return {
        point: c.point.text,
        maxMarks: c.point.marks,
        earnedMarks: Math.round(c.point.marks * fraction * 2) / 2,
        status: fraction === 1 ? 'full' : fraction >= 0.5 ? 'partial' : 'missing',
        missingKeywords: c.groups.filter((g) => !g.matched).map((g) => g.missing),
      };
    })
  );

  const total = Math.round(scored.reduce((s, p) => s + p.earnedMarks, 0) * 2) / 2;

  await examiner.act(trace, 'writing examiner notes', async () => {});
  const notes = [];
  const wordCount = normalize(answerText).split(' ').filter(Boolean).length;
  if (wordCount < 10) notes.push('Very short answer - examiners award marks per point, so write one line per marking point.');
  const missed = scored.filter((p) => p.status === 'missing');
  if (missed.length) notes.push(`${missed.length} marking point(s) missing - those cost full marks even when the rest is correct.`);
  if (total >= question.marks) notes.push('Full marks. This is what the examiner wants to see.');

  const modelAnswer = await rewrite.act(trace, 'composing the full-mark model answer', async () =>
    question.points.map((p) => p.text).join(' ')
  );

  return {
    questionId: question.id,
    score: total,
    maxScore: question.marks,
    points: scored,
    notes,
    modelAnswer,
    trace,
    agents: [keywordChecker.name, examiner.name, rewrite.name],
    engine: 'rule-based agent brains (no AI key used yet)',
  };
}

module.exports = { gradeAnswer, agents: { keywordChecker, examiner, rewrite } };
