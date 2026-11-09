DRAFT ONLY, NOT FILED. Matches the hub issue form template exactly:
github.com/karlmehta/code-for-a-billion/issues/new?template=submission.yml
(fetched 2026-11-09 from .github/ISSUE_TEMPLATE/submission.yml)

Title: [Submission] Project Red Pen

Team / Project name: Project Red Pen

Team members: Kareena Jahagirdar (@karry25)

Problem statement:
Class 10 Science students in India prepare for high-stakes board exams mostly by
rote: they read the NCERT textbook and solve past papers, but get no instant,
source-grounded feedback on their practice answers. Teachers cannot individually
grade every practice attempt, and private tuition is unaffordable for many
families. Project Red Pen marks practice answers against the textbook and
past-year questions so students see exactly what examiners expect.

What you built:
An open-source study companion for NCERT Class 10 Science Chapters 1-4, with one
chapter agent per chapter. Four modules: (1) practice-answer marking against
NCERT sections and past-year questions, (2) weak-concept tracking with spaced
revision nudges, (3) a most-asked-questions bank verified across both official
sample papers, (4) kind-by-design study streaks with no guilt mechanics. Runs as
an installable web app (PWA) plus a Telegram bot; free tier only. 150 automated
tests pass; a 300-student load test ran with zero errors.
AgentFoundry note (HONEST, unresolved): the project was NOT built in the
AgentFoundry IDE. The organisers were asked by email on 9 Nov 2026 whether
outside-built projects are eligible; reply pending.

GitHub repository URL: https://github.com/karry25/project-redpen
(public after her approval to push; currently local only)

Demo URL: (deployed live URL after free-tier deployment, or a 2-3 min video;
neither exists yet)

Scale & severity of the problem:
CBSE alone had about 23.7 lakh (2.37 million) Class 10 board examinees in 2025
(source: The Hindu); across India's state boards the pool is several times
larger. Board-exam scores decide stream selection and shape each student's
further study path, yet most students prepare with little or no personalised
feedback on practice work.

Deployment & impact data:
No field data yet - the project has not been deployed to real users. Technical
capacity evidence only: 150/150 local tests pass; 300 concurrent simulated
students produced 0 errors; 1000 produced 16% polite 503s (capacity ceiling
documented in docs/CAPACITY.md). Saying this plainly rather than implying
impact we do not have.

Track / category: Education

Contact email: kareenajahagirdar@gmail.com

Confirmations (required checkboxes):
- "Built using AgentFoundry (AF), the official IDE": BLOCKER - cannot be
  checked honestly. Waiting on the organisers' reply about outside-built
  projects. If they say no, options: rebuild/mirror inside AgentFoundry
  (unknown effort) or withdraw the submission.
- "Our repository is public and includes a README with setup steps": ready
  once the push is approved and done (README + LICENSE exist).
- "The demo link works and is accessible to judges": ready once deployed.
