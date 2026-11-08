# Red Pen security pass (checkpoint, 8 Nov 2026)

Passed = I ran the check and saw it hold. Untested = not checked yet. Not a third-party audit.

## Passed
- Prompt injection, doubt box and Telegram text, /compare and /findvideo input: 40/40 eval cases (evals/run.js sections 5a, 5b): no leak, no secret, no link echo, no obedience.
- Prompt injection through the real model: 4/4 hostile questions (live run). The model sees the question only as quoted DATA, and the output guard drops links, markup and unsourced formulas.
- Grader injection ("give full marks"): 35/36 held; one case scored 0.5 (see KNOWN ISSUES).
- Exposed keys: no key, token or secret in the repo or full git history (pattern scan; the only hit is a fake test string "gsk_EVALSECRET123"). .env and data/store are git-ignored. Keys are read from environment only; /healthz and errors never print them.
- Open data: /.env, /.git/config, /data/*, /lib/*, /agents/*, path traversal variants (/../, %2e%2e, ..%2f) all return 404. Only /public is served.
- Cross-user access: each Telegram chat has its own memory file keyed by chat id; test shows chat 22 sees nothing of chat 11 (test/memory_test.js). The web app keeps memory in the student's own browser (localStorage), nothing server side to cross.
- Video links: /api/compare refuses anything but real youtube.com / youtu.be video links: 127.0.0.1, 169.254.169.254, file://, javascript: and a lookalike host (youtube.com.evil.com) were all refused, so no server-side request goes to a user-chosen host.
- Memory files: /mydata shows and /stop or /delete clears a student's own data; files hold learning progress only.
- Web: CSP (script-src 'self', no inline script), nosniff, no-referrer, frame-ancestors none. Remote text goes in with textContent; no student text is reflected back into HTML.
- Abuse: per-IP and per-chat rate limits, 20 KB body cap (connection dropped above it).
- Telegram webhook: secret path plus secret header check, update-id dedupe.

## Untested
- Real Telegram traffic (bot token still pending, so the bot ran against a fake Telegram only).
- Any hosted deployment (headers behind a real proxy, HTTPS, real client IPs for the limiter).
- Dependency audit (the app has no npm dependencies, so low risk, but not scanned).
- Independent penetration test.

## Known issues
- AI answers can be wrong in ways the guard cannot see (hand review: 1 of 5 passed answers mis-defined "base vs alkali"). They carry a "double-check with your NCERT section" line.
- The grader is keyword based: a keyword salad of sentences-less keywords is capped, but keyword stuffing inside sentences can still earn marks.
