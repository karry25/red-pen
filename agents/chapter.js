// Chapter agents: one subject-expert agent per NCERT chapter, working
// under the Coordinator. The module agents (Examiner, Doubt, Junior,
// Triage) are pedagogy specialists; the chapter agent owns the subject
// content pack (questions, PYQs, doubt KB, teach topics, explainers) and
// joins the trace whenever a request touches its chapter, so the agent
// work stays visible.
const { Agent } = require('./base');
const fs = require('fs');
const path = require('path');

class ChapterAgent extends Agent {
  constructor(pack) {
    super({
      name: `Ch.${pack.number} Guide`,
      role: `You are the subject-expert guide for NCERT Class 10 Science Chapter ${pack.number}: ${pack.title}. You own this chapter's verified content (NCERT ${pack.source}). When the Examiner, Doubt or Junior agent needs chapter material, you supply it. You never grade yourself - you hand accurate content to the pedagogy agents.`,
    });
    this.chapterId = pack.id;
    this.number = pack.number;
    this.title = pack.title;
    this.source = pack.source;
    this.pack = pack;
  }

  get questions() { return this.pack.questions || []; }
  get pyqs() { return this.pack.pyqs || []; }
  get kb() { return this.pack.kb || []; }
  get teachTopics() { return this.pack.teachTopics || []; }
  get explainers() { return this.pack.explainers || []; }
  allQuestions() { return [...this.questions, ...this.pyqs]; }
}

let registry = null;

function loadChapters() {
  if (registry) return registry;
  registry = new Map();
  const dir = path.join(__dirname, '..', 'data', 'chapters');
  for (const f of fs.readdirSync(dir).filter((f) => /^ch\d+\.json$/.test(f)).sort()) {
    const pack = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    registry.set(pack.id, new ChapterAgent(pack));
  }
  return registry;
}

function getChapter(id) {
  const chapters = loadChapters();
  return chapters.get(id) || chapters.get('ch1');
}

function listChapters() {
  return [...loadChapters().values()].map((c) => ({
    id: c.chapterId, number: c.number, title: c.title, agent: c.name,
    counts: { questions: c.questions.length, pyqs: c.pyqs.length, doubts: c.kb.length, topics: c.teachTopics.length, explainers: c.explainers.length },
  }));
}

// Find a question (bank or PYQ) across every chapter. Returns {chapter, question}.
function findQuestion(questionId) {
  for (const c of loadChapters().values()) {
    const q = c.allQuestions().find((x) => x.id === questionId);
    if (q) return { chapter: c, question: q };
  }
  return null;
}

// Detect which chapter a free-text doubt is about (keyword routing; the
// caller's explicit chapter choice always wins over this guess).
const CHAPTER_HINTS = [
  { id: 'ch2', hints: ['acid', 'base', 'salt', 'ph', 'indicator', 'litmus', 'neutralis', 'neutraliz', 'antacid', 'baking', 'washing soda', 'plaster', 'gypsum', 'bleaching', 'chlor-alkali', 'brine', 'tooth', 'sting', 'hydronium', 'crystallis', 'crystalliz', 'lime water', 'limewater'] },
  { id: 'ch1', hints: ['balance', 'balancing', 'equation', 'rust', 'corrosion', 'rancidity', 'decomposition', 'combination', 'displacement', 'exothermic', 'endothermic', 'oxidation', 'reduction', 'redox', 'magnesium', 'electrolysis of water'] },
];

function detectChapter(text) {
  const t = String(text || '').toLowerCase();
  const m = t.match(/\bch(?:apter)?[.\s-]*(\d)\b/);
  if (m && loadChapters().has(`ch${m[1]}`)) return getChapter(`ch${m[1]}`);
  let best = null; let bestScore = 0;
  for (const { id, hints } of CHAPTER_HINTS) {
    if (!loadChapters().has(id)) continue;
    const score = hints.reduce((s, h) => s + (t.includes(h) ? h.length : 0), 0);
    if (score > bestScore) { bestScore = score; best = id; }
  }
  return best ? getChapter(best) : null; // null = no opinion; caller picks the active/default chapter
}

module.exports = { loadChapters, getChapter, listChapters, findQuestion, detectChapter, ChapterAgent };
