# Red Pen

**Practise like the examiner.** CBSE Class 10 Science board prep (NCERT Ch.1-4), one app, four modules, one chapter agent per chapter.

Code for a Billion, Track: Education. Status: CHECKPOINT build, not final.

## The problem
Board exams reward keywords, structure and the right NCERT facts. Students practising at home have no examiner and no one to answer a doubt at 11 pm.

## Modules
1. Board-Examiner: grades an answer against the CBSE marking scheme (Keyword Checker, Examiner, Rewrite agents).
2. Doubt Solver: answers from verified notes, with the NCERT section named. If the notes miss, a grounded AI path (Groq) answers only from those notes, or says it does not know.
3. Teach-to-Learn: the student explains a topic, the agent checks it.
4. Exam Triage: what to study first, from PYQ and sample-paper patterns (REPEATED only when verified in both papers).
Extras: formula cards (26), NCERT Exemplar MCQs (96, official key), study path, 1-minute quick mode, gentle opt-in daily drip, video find/compare (titles only, never claims to have watched), rating buttons.

## Honest limits
- Grading is keyword based and can be gamed. AI answers can be wrong; they are labelled.
- Free Groq tier: about 490 AI answers per day. See docs/CAPACITY.md.
- Evals with real scores: evals/RESULTS.md. Security pass: docs/SECURITY.md.
- Engagement is kind: opt-in, no guilt, no streak punishment, /stop anytime.

## Run
    node server.js            # web app on :4173, no npm install needed
    GROQ_API_KEY=... node server.js   # enables the AI path
    node test/run_all.js      # tests
    node evals/run.js         # evals (add --live for network checks)
Telegram: set TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET (webhook mode).

## License
MIT (see LICENSE). NCERT content is cited and linked, not redistributed.
