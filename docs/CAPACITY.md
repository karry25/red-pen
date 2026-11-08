# What free Red Pen can really serve (measured on this sandbox, fake Groq with real limits)

- Real Groq free-tier limits seen in response headers: 8,000 tokens/min and 1,000 requests/day per model (gpt-oss-120b, gpt-oss-20b).
- One AI answer costs about 800 tokens: about 8 per minute and about 245 per day per model, so about 490 AI answers/day with two models. This is the first thing that breaks.
- Everything rule-based (grading, FAQ doubts, formulas, Exemplar, study path, drip) does not call Groq. Measured CPU 0.00024-0.00037 s per request, 82-96 MB RAM.
- Load test, 60 s ramp: 300 students: 3,600 requests, 0 errors, p99 about 400 ms. 1,000 students: 12,000 requests at about 137 req/s, 16% answered 503 "busy" by the global limiter (by design), the rest 200 with p99 8 ms; 28 Groq calls, 436 AI requests fell back to rule-based answers.
- Honest summary: 300 active students per minute-burst is comfortable; 1,000 at once sheds some load; about 490 AI answers a day total however many students there are. Student count per day for the non-AI features is far higher (not found yet).
- Not measured: real host CPU (free hosts are slower than this sandbox), real YouTube blocking from a host IP, real Telegram send limits at load, free-host cold start (about 1 minute after idle; verify the host's current policy before relying on it).
