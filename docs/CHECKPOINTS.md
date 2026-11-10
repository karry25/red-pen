# Red Pen checkpoint tracker

Format per Kareena's standing rule (10 Nov 2026): every checkpoint = BUILD / TEST / EVIDENCE /
PASS-FAIL / FIX (what must change before moving on). Verdicts: PASS = evidence held,
FAIL = evidence contradicted, NOT TESTED = no evidence yet. Nothing is "final" or
"production-ready" until every promised part PASSes.

Updated: 10 Nov 2026, after F1/F2 + push (commit 6609d58, 185/185 tests).

## 1. Four core modules (examiner grading, doubts, teach-back, triage)
- BUILD: done.  - TEST: unit + feature suite + scored evals.
- EVIDENCE: 185/185 (node test/run_all.js @ 6609d58); evals: grading 36/36, injection 35/36, out-of-scope refusal 16/16 (evals/RESULTS.md).
- VERDICT: PASS.  - FIX: none required; grader keyword-gaming limit stays disclosed in-app.

## 2. Extras (formulas, exemplar MCQ 96 + written 24, study path, quick mode, drip)
- BUILD: done.  - TEST: feature suite + official-key spot checks.
- EVIDENCE: 9/9 key spot checks; written answers verified against NCERT's official answer book (jeep1an.pdf); 390x844 screenshots both modes.
- VERDICT: PASS.  - FIX: none required.

## 3. F1 student model + F2 exam countdown
- BUILD: done.  - TEST: 18 new checks in the suite.
- EVIDENCE: 185/185; simulator transcript screenshots with real bot replies.
- VERDICT: PASS (simulator). Telegram-live part NOT TESTED - see #7.
- FIX: pass #7's live pass rule, then re-mark this PASS end to end.

## 4. Web visuals
- BUILD: done.  - TEST: phone-size visual inspection.
- EVIDENCE: hero, chapters, study kit, exemplar both modes, footer verified at 390x844 (screenshots in chat history).
- VERDICT: PARTIAL PASS.
- FIX: one full-page sweep of every module card at 390x844 + one older-Android Chrome pass; screenshot each screen.

## 5. Security
- BUILD: done at checkpoint scope.  - TEST: docs/SECURITY.md audit.
- EVIDENCE: injection 40/40 + 4/4 live-model, traversal probes 404, cross-user isolation test, headers, rate limits, webhook secret.
- VERDICT: PASS at checkpoint scope. Untested: hosted deployment, real Telegram traffic, dependency audit, third-party pentest.
- FIX: rerun the audit against the live deployment (#8); dependency audit when deps exist.

## 6. GitHub push
- BUILD: done.  - TEST: API verification of remote state.
- EVIDENCE: remote main = 6609d58 on karry25/red-pen (public), 32 new commits, secrets scan clean, no force-push.
- VERDICT: PASS.  - FIX: none.

## 7. Telegram bot live
- BUILD: connector done (webhook mode).  - TEST: live only.
- EVIDENCE: none - bot token still pending (vault request open). Simulator evidence only.
- VERDICT: NOT TESTED.
- FIX: token via vault -> live getMe -> one real doubt -> one real drip cycle -> screenshot. Then re-mark.

## 8. Deployment (Render free tier)
- BUILD: prep done (render.yaml, package.json, /healthz).  - TEST: live URL + phone screenshot.
- EVIDENCE: none - account step gated on her yes (notice sent 12:47 AM 10 Nov).
- VERDICT: NOT TESTED.
- FIX: her yes -> create free account (she sets password via vault) -> deploy -> live URL returns app + /healthz ok + 390x844 screenshot of the deployed app.

## 9. Login + real database (Firebase Auth + Firestore, her steer)
- BUILD: not started.  - TEST: sign up/in/out, cross-device sync, row rules, /forget deletes rows.
- EVIDENCE: none - awaiting her go-ahead + account step.
- VERDICT: NOT TESTED.
- FIX: her yes -> build behind a storage interface -> Spark free tier (no card) -> tests above -> privacy copy updated wherever the app says "No login".

## 10. AgentFoundry mirror + submission checkbox
- BUILD: not started (honest-effort assessment pending).  - TEST: AF checklist + organisers' rules.
- EVIDENCE: none. Blockers: AF email confirmation (her click, or permission for me to open her Gmail), organisers' reply on outside-built projects.
- VERDICT: NOT TESTED.
- FIX: resolve both blockers, then assess mirroring honestly; never tick the AF box until it is true.

## 11. Photo answer checking
- BUILD: not started (labelled "(soon)" in-app - not promised this checkpoint).
- VERDICT: NOT TESTED.
- FIX: scope it as its own milestone (vision eval set + honest accuracy numbers) before promising it to anyone.
