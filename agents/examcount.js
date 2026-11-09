// Agentic exam countdown (F2): the student sets one date (/exam YYYY-MM-DD) and the
// agent does the watching - re-planning around their weak spots at 14, 7, 3 and 1 days
// out, without anyone opening the app. Kind by design: no panic copy, no guilt, /exam off
// stops it, and nudges respect the same quiet hours as the drip (22:00-07:00 IST).
const memory = require('./memory');
const studypath = require('./studypath');
const drip = require('./drip');

const THRESHOLDS = [14, 7, 3, 1];
const IST = 5.5 * 60 * 60 * 1000;

function daysLeft(examDate, now = Date.now()) {
  const dayStartIST = (t) => Math.floor((t + IST) / 86400000);
  const exam = new Date(examDate + 'T00:00:00+05:30').getTime();
  return dayStartIST(exam) - dayStartIST(now);
}

// Nudges due right now: [{ chatId, days, text }]. Marks them sent so each threshold fires once.
function dueNudges(now = Date.now()) {
  if (drip.quiet(now)) return [];
  const out = [];
  for (const chatId of memory.examChats()) {
    const rec = memory.get(chatId);
    if (!rec || !rec.examDate) continue;
    const left = daysLeft(rec.examDate, now);
    if (left < 0) continue;
    // the current milestone is the smallest threshold not yet passed; earlier
    // milestones are history and never fire (or re-fire) later
    const milestone = [...THRESHOLDS].sort((a, b) => a - b).find((t) => left <= t);
    if (milestone === undefined) continue;
    if (rec.examNudges && rec.examNudges[String(milestone)]) continue;
    const hit = milestone;
    const plan = studypath.buildPath({ days: Math.max(1, left), minutesPerDay: 60, mem: rec });
    const first = plan.doFirst.slice(0, 4).map((r) => `- Ch.${r.chapter.slice(2)} ${r.name}`).join('\n');
    out.push({
      chatId,
      days: left,
      text: `${left} day${left === 1 ? '' : 's'} to your exam (${rec.examDate}). I quietly re-planned around what you still find hard. First things first:\n\n${first}\n\n${plan.skip.length ? 'Safe to skim: ' + plan.skip.slice(0, 4).map((c) => c.name).join(', ') + '.\n\n' : ''}Small steps now beat panic later - you have got this. /path for the full plan, /exam off to stop these.`,
    });
    memory.record(chatId, { type: 'examNudge', daysLeft: hit });
  }
  return out;
}

module.exports = { dueNudges, daysLeft, THRESHOLDS };
