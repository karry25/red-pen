// Module 4 - 7-Days-Left Triage + Timetable: the Planner agent.
// Inputs: days left + the student's honest confidence per chapter
// (strong / shaky / blank = the diagnostic). Tool: an indicative PYQ
// weightage table. Output: a ruthless, ranked plan - FOCUS / REVISE /
// SKIP - mapped day by day. Daily check-ins update confidence and the
// plan adjusts. Fully rule-based: works with no AI key.
const { Agent } = require('./base');
const { makeLlmBrain } = require('./brains');
const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'triage.json'), 'utf8'));

const planner = new Agent({
  name: 'Triage',
  role: 'You are a no-nonsense exam-week planner. With days left and the student\'s honest confidence per chapter, you decide what to FOCUS on, what to quickly REVISE, and what to SKIP, using past-paper weightage. You never pretend a skipped chapter will be studied.',
});

const sessions = new Map(); // sessionId -> { daysLeft, confidence: {chId: 0|1|2} }

// Diagnostic: the 5 questions are confidence checks on the 5 heaviest chapters.
function diagnosticChapters() {
  return [...data.chapters].sort((a, b) => b.weight - a.weight).slice(0, 5);
}

function buildPlan(sessionId, daysLeft, confidence) {
  const days = Math.max(1, Math.min(30, parseInt(daysLeft, 10) || 7));
  const prev = sessions.get(sessionId) || {};
  sessions.set(sessionId, { daysLeft: days, confidence: { ...(prev.confidence || {}), ...confidence } });
  const conf = sessions.get(sessionId).confidence;

  // Priority = marks at stake x how badly it needs work (blank=2, shaky=1.5, strong=0.5)
  const needFactor = { 0: 2, 1: 1.5, 2: 0.5 };
  const scored = data.chapters.map((ch) => {
    const c = conf[ch.id] !== undefined ? conf[ch.id] : 1; // unrated = shaky
    return { ...ch, confidence: c, priority: ch.weight * (needFactor[c] || 1.5) };
  }).sort((a, b) => b.priority - a.priority);

  // Ruthless cut: with few days, low-weight weak chapters are skipped.
  const capacity = days * 2; // ~2 chapter-blocks per day is honest
  const focus = [];
  const revise = [];
  const skip = [];
  scored.forEach((ch) => {
    if (ch.confidence === 2) revise.push(ch); // strong chapters: quick revise only
    else if (focus.length < Math.ceil(capacity / 2)) focus.push(ch);
    else if (ch.weight <= 4) skip.push(ch);
    else revise.push(ch);
  });

  // Day-by-day: heaviest priority first, 2 blocks/day, revise strong ones last day
  const schedule = [];
  const queue = [...focus, ...revise.filter((c) => c.confidence !== 2)];
  const scheduled = [];
  for (let d = 1; d <= days; d++) {
    const todays = queue.splice(0, 2);
    if (d === days) todays.push(...revise.filter((c) => c.confidence === 2).slice(0, 2));
    if (todays.length) {
      schedule.push({ day: d, chapters: todays.map((c) => c.name) });
      scheduled.push(...todays);
    }
  }
  // Honesty: what does not fit the schedule is skipped, whatever it was called.
  const leftover = [...focus, ...revise].filter((c) => !scheduled.includes(c));
  skip.push(...leftover);
  const focusF = focus.filter((c) => scheduled.includes(c));
  const reviseF = revise.filter((c) => scheduled.includes(c));

  const coverable = scheduled.reduce((s, c) => s + c.weight, 0);
  const skipped = skip.reduce((s, c) => s + c.weight, 0);

  // Real timetable: Pomodoro-sized slots (50 min + 10 min break),
  // retrieval practice after lunch (Roediger & Karpicke 2006),
  // spaced revision slot in the evening (Ebbinghaus 1885),
  // interleaved chapters across the day (Make It Stick, 2014).
  const SLOT_TIMES = ['9:00', '11:30', '15:00', '17:30'];
  const SLOT_KIND = ['Focus study', 'Focus study', 'Practice questions', 'Revision + weak points'];
  const timetable = schedule.map((d) => {
    const slots = d.chapters.map((name, i) => ({
      time: SLOT_TIMES[i], kind: SLOT_KIND[i], label: `${name} (50 min + 10 min break)`,
    }));
    slots.push({
      time: SLOT_TIMES[2], kind: SLOT_KIND[2],
      label: `${d.chapters[0]} - answer 2 board questions in Board-Examiner Mode`,
    });
    slots.push({
      time: SLOT_TIMES[3], kind: SLOT_KIND[3],
      label: 'Re-check today\'s missed points + revision queue items (spaced revision)',
    });
    return { day: d.day, slots };
  });

  return {
    daysLeft: days,
    timetable,
    timetableWhy: 'Slots follow the Pomodoro Technique (Cirillo, 1980s); afternoon practice = retrieval practice (Roediger & Karpicke, Psychological Science 2006); evening revision = spacing (Ebbinghaus, 1885); mixed chapters = interleaving (Make It Stick, Brown/Roediger/McDaniel 2014).',
    focus: focusF.map((c) => ({ name: c.name, weight: c.weight, confidence: ['blank', 'shaky', 'strong'][c.confidence] })),
    revise: reviseF.map((c) => ({ name: c.name, weight: c.weight, confidence: ['blank', 'shaky', 'strong'][c.confidence] })),
    skip: skip.map((c) => ({ name: c.name, weight: c.weight })),
    schedule,
    summary: `Covering ~${coverable} of 80 marks' worth of chapters. Skipping ~${skipped} marks (that's the honest trade-off with ${days} day(s) left).`,
    weightageNote: data.note,
    agent: planner.name,
    engine: 'rule-based planning over PYQ weightage (no AI key used yet)',
  };
}

async function makePlan(sessionId, daysLeft, confidence, trace) {
  const plan = await planner.act(trace, `building a ${daysLeft}-day triage plan from weightage and your confidence`, async () =>
    buildPlan(sessionId, daysLeft, confidence)
  );
  planner.remember({ sessionId, daysLeft });
  return plan;
}

async function checkIn(sessionId, chapterId, newConfidence, trace) {
  const s = sessions.get(sessionId);
  if (!s) return { error: 'No plan yet - build one first.' };
  return planner.act(trace, `adjusting the plan: ${chapterId} confidence updated`, async () =>
    buildPlan(sessionId, s.daysLeft, { [chapterId]: newConfidence })
  );
}

module.exports = { diagnosticChapters, makePlan, checkIn, agents: { planner } };

// Brain upgrade path: if a free Gemini/Groq key is set in the environment
// (vault-approved), agents get an LLM brain; otherwise rule-based stays.
{
  const brain = makeLlmBrain();
  if (brain) Object.values(module.exports.agents || {}).forEach((a) => a.setBrain(brain));
}
