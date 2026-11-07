# Red Pen 🖊️
**Practise like the examiner.** CBSE Class 10 board prep with 4 AI agents, starting with Science Ch.1 (Chemical Reactions and Equations).

Code for a Billion · Track 01: Education.

## The problem
Board exams grade on keywords and presentation, not just knowledge. Students practising at home have no examiner to warn them before the real exam.

## The 4 agents
| Module | Agents | What it does |
|---|---|---|
| 1 · Board-Examiner | Keyword Checker → Examiner → Rewrite | Grades your answer against the CBSE marking scheme: missing keywords in red, half-marks, model answer |
| 2 · Shy-Doubt | Doubt + Digest | Anonymous Hinglish doubt box; teacher sees the batch's top confusions, never names |
| 3 · Teach-the-Junior | Junior + Assessor | You teach a confused AI junior; the understanding meter rises only when the Assessor confirms real coverage |
| 4 · 7-Days Triage | Triage | Days left + honest confidence per chapter → FOCUS/REVISE/SKIP plan from PYQ weightage, day by day |

A **Coordinator** agent routes every student message to the right specialist. Built so a WhatsApp/Telegram chat adapter can plug in.

## Run it
```bash
node server.js   # Node 18+, zero dependencies
# open http://localhost:4173
```

## Honesty & privacy
- Works fully with **no API key** (rule-based agent brains). With a free Gemini/Groq key in the environment, agents get LLM brains - same roles, same tools.
- No login, no database. Answers are processed in memory and never stored.
- Doubts are anonymous by design; the teacher digest shows topics, never who asked.

## License
MIT
