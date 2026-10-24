# Discovery Cockpit — Project Instructions

## What this is
An AI-powered discovery/assessment call system for consultants: private live coaching
view for the consultant, a client-safe reveal view, and a generated prototype
dashboard (assessment sessions). Original code and branding only. Never use the name "Consultant Cockpit" or any
third-party trademark, logo, or copied marketing copy anywhere in code, UI, or docs.

## Stack
Next.js 15 App Router, TypeScript strict, Tailwind 3, shadcn-style components (hand-written in
`src/components/ui`), Prisma 6 + SQLite (Postgres-ready schema). Planned: Anthropic Claude API
behind an `AIProvider` interface.

## Hard rules
1. PRIVACY BOUNDARY: Client Reveal and Prototype routes receive ONLY allow-listed data
   (Report.revealData and the validated PrototypeModule rows). Coaching data, internalNotes, decisionReadiness, and raw
   extractions must never be passed to those components, serialized into their pages,
   or included in PDF/Gamma/email exports. The reveal privacy tests must always pass.
2. DEMO MODE FIRST: every feature must work with the mock engine and no API keys.
   Never make an external API call in a code path the demo depends on.
3. All AI output is untrusted: validate against the TypeScript types/schema before storing
   or rendering. Fall back to mock output on failure.
4. All AI prompts live in one file (planned: `src/lib/ai/prompts.ts`) — nowhere else. No prompt
   strings inline in components or API routes.
5. Transcript processing must be incremental (new segments only) — never reprocess a
   whole transcript on every update. (KNOWN DEVIATION: the mock engine's `analyze()` re-reads the
   transcript-so-far per segment. Fix before a paid model is wired in.)
6. Keep the app runnable after every change: run typecheck, lint, and tests before
   declaring a task done, and report their results honestly.

## Conventions
- Server components by default; client components only where interactivity requires it.
- Money is stored as numbers in dollars; formatting happens at render time only.
- Session status transitions SETUP -> LIVE -> REVIEW -> REVEALED -> COMPLETED are enforced in one place,
  `src/lib/sessions.ts`; server code calls `assertTransition`, never writes `status` unchecked. COMPLETED is final.
- Transcript sources (demo, paste, upload, manual) all go through `POST /api/sessions/[id]/transcript`; parsing
  lives in `src/lib/transcript.ts` and runs in the browser (preview) and on the server (the stored result).
- Anything that fetches a user-supplied URL must go through `src/server/safe-fetch.ts`. Never call `fetch` on one directly.
- User-supplied images are stored as validated `data:` URLs (`src/lib/logo.ts`) and rendered only inside `<img>`.
- Question banks are data, not hard-coded in components: `src/lib/mock-ai/questions.ts` (discovery) and
  `banks.ts` (operations, technology; `bankFor(type)`). Topics are unique across banks; every topic needs a detector
  in `detectors.ts` (a test enforces both).
- Prototype modules are data-driven: add a type in `src/lib/prototype/schema.ts` (strict schema + title), a builder in
  `generate.ts`, and a renderer. Invented rows must carry `example: true`; finance actuals say `stated` or `example`.
- The demo call is data too: `src/lib/demo/demo-call.ts` (Demo Seed Pack). The seed script, the
  "Load Demo Call" button and the tests all read it, so they cannot drift.
- No `.env` is needed: `scripts/prisma.mjs` and `src/lib/db.ts` default `DATABASE_URL`. Use
  `npm run prisma -- <args>`, not bare `npx prisma`.

## Testing
Run: `npm run typecheck && npm run lint && npm test`
Must pass before any feature is called complete: the privacy tests (`tests/privacy.test.tsx`,
`tests/reveal-route.test.tsx`), talk-ratio, tech-stack totals, and question-matching tests
(`tests/engine.test.ts`, which pins the engine to the Demo Seed Pack's expected outputs and
keeps a second, different call as a regression fixture).

## Lessons from building this (so they aren't re-learned)
- Test the privacy boundary at the ROUTE level, not just the component: a root-layout
  `<meta description>` once leaked "Private coaching…" onto the client page.
- Leak scans must decode HTML entities (React escapes `'` as `&#x27;`) or they miss apostrophes.
- A privacy test is only evidence if it can fail: keep the negative controls, and mutate the code
  to confirm a deliberate leak turns the suite red.
- Never read mutable closure state inside a React state updater (the talk timer dropped half its
  ticks this way). Compute the delta first.
- Timer/player hooks schedule from effects; fake-timer tests must advance in small `act()` steps.
- Exercise the real UI in a browser before declaring done: unit tests did not catch an emptied
  route file, the head-metadata leak, or the timer bug.
- Do not tune an engine rule to one transcript: check every rule change against both fixtures.
- A seed script that reuses an app function inherits its side effects (the staged demo came out "Live"): set the
  state you actually mean.
- Fire-and-forget requests that run as a page navigates away need `keepalive`.
- Read generated content, not just its tests: reading the prototype caught an internal-cost topic proposed as public
  content, a nonsensical "4 of 4 ... the rest are examples", and a placeholder budget phrased as an overrun.
- A forbidden-key list is per document: `severity` is private on the reveal but a normal field in the prototype's alerts.
- Grid items need `min-w-0` (and `grid-cols-[minmax(0,1fr)]`) or they refuse to shrink on a phone.
- Test hostile inputs against the real thing (a real local HTTP server for SSRF, real VTT exports for parsing),
  and mutate the guard to prove the test can fail.
