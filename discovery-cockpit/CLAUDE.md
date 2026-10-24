# Discovery Cockpit — Project Instructions

## What this is
An AI-powered discovery/assessment call system for consultants: private live coaching
view for the consultant, a client-safe reveal view, and a generated prototype
dashboard (assessment sessions). Original code and branding only. Never use the name "Consultant Cockpit" or any
third-party trademark, logo, or copied marketing copy anywhere in code, UI, or docs.

## Stack
Next.js 15 App Router, TypeScript strict, Tailwind 3, shadcn-style components (hand-written in
`src/components/ui`), Prisma 6 + SQLite (Postgres-ready schema). Anthropic Claude API behind the `AIProvider`
interface (`src/lib/ai/types.ts`); the rule-based mock is the default.

## Hard rules
1. PRIVACY BOUNDARY: Client Reveal and Prototype routes receive ONLY allow-listed data
   (Report.revealData and the validated PrototypeModule rows). Coaching data, internalNotes, decisionReadiness, and raw
   extractions must never be passed to those components, serialized into their pages,
   or included in PDF/Gamma/email exports. The reveal privacy tests must always pass.
2. DEMO MODE FIRST: every feature must work with the mock engine and no API keys.
   Never make an external API call in a code path the demo depends on.
3. All AI output is untrusted: validate against the TypeScript types/schema before storing
   or rendering. Fall back to mock output on failure.
4. All AI prompts live in one file, `src/lib/ai/prompts.ts` — nowhere else. No prompt
   strings inline in components or API routes.
5. Paid-model processing must be incremental (new segments only) — never re-send the whole transcript on every
   update. The Claude provider sends new lines + a little context + a summary of what is known. (The rule-based
   mock still re-reads the transcript-so-far per segment: that is free local CPU, so it is allowed.)
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
- Reveal estimates (`src/lib/reveal/roi.ts`) use only client-stated numbers plus two printed assumptions; anything
  derived must be re-checked in the schema's `superRefine` so tampering fails closed. Never sum figures that can
  overlap, and count one statement once (`hoursSource`).
- Anything that leaves the app (`src/server/outgoing.ts`): recipients come from the database, never the request; text is
  written by the app from the validated review; every attempt is counted against an hourly limit AFTER cheap
  validation (a refused request must cost nothing); errors from SMTP/Chromium are logged, not returned; no secrets in the
  database or responses. PDFs load the loopback origin only. Calendar text goes through `icsText`/`cn`/`fold`.
- Live sources (typed, spoken) all end in `appendLine(speaker, text)`. Speaker attribution must never let a tap reassign
  words already in flight (`Attributor`); and anything that starts an asynchronous browser capability needs a visible
  "starting" state: a permission prompt produces no event at all.
- Test with the real engine's shape, not just a fake that always answers: modern Chromium has a native unprefixed
  `SpeechRecognition` that the app prefers, and a headless sandbox's native engine silently does nothing.
- Money is read from `$`, "N dollars/bucks/CAD/USD", and spoken number words ("four thousand dollars", "twelve hundred
  dollars", "four grand"), with a currency cue ALWAYS required and a strict number-word grammar ("nineteen ninety nine"
  is rejected, not summed). A new form needs positive cases AND false-positive cases ("ten thousand leads", "a grand total").
- Settings saved from several fields at once (blur-to-save) must be serialised: one request in flight, the latest queued
  behind it. Overlapping PUTs of whole snapshots can land out of order and let a stale one win.
- Prototype edits go through ONE guarded endpoint with a closed set of strict operations (`src/lib/prototype/edit.ts`);
  the result is re-validated against the module's strict schema before it is stored, and the page shows controls only
  when `ownsSession` is true (it may ask who you are, never require a login). Never store a sentence that an edit can
  make false (compute provenance at render time), and a label describes the field it names (finance `source` is about the
  ACTUAL).
- Access control: every API route calls `apiConsultant(req)` or `guardSession(req, id)` BEFORE reading the body; every
  page calls `requireConsultant()` (the cockpit also `ownsSession`). Another consultant's record is a 404, never a 403.
  The only public routes are listed in `tests/access.test.ts`, which fails for any route or page that is neither
  guarded nor listed. `listSessions`-style helpers take a REQUIRED consultant id: never an optional one that lists everyone.
- Run modes: `AUTH_MODE=local` (dev/tests default) or `accounts` (production default). Tests that exercise accounts mock
  `next/headers` with a cookie jar (see `tests/access.test.ts`).
- Exports (`src/lib/reveal/export.ts`, `src/lib/email.ts`, `src/server/share.ts`) take only the validated
  `RevealData`. Never give them a session, extraction or coaching object. HTML export: inline styles only, escape
  every string. Email goes through `EmailProvider`; `mailtoHref` validates the recipient and drops optional
  paragraphs to stay under ~1,900 characters.
- Anything typed into the cockpit (notes, a reworded question) must survive a row moving between sections and the
  user leaving mid-sentence: keep drafts in the parent, autosave on a debounce keyed on the drafts (not on props
  that change every played segment), and flush on blur, unmount and `pagehide` (with `keepalive`).
- Print: use `.avoid-break` on rows and cards, `.reveal-section` so headings stay with content, `print:hidden` on
  controls, and `.keep-colors` on a link whose colours are part of its design (the global print rule strips link colour).
- Do not `pkill -f` / `pgrep -f` a pattern that also appears in your own command line (it kills the shell: exit 144).
  Use `ps -eo pid,args | awk '/[n]ext-server/ {print $1}' | xargs kill` and start servers in a separate call.
- Python `open(p, "w").write(open(p).read())` truncates the file before reading it. Read first, then write.
- Prisma refuses `migrate reset` from an agent. Refresh demo data with `npm run db:seed` (it only recreates the demo
  records); do not work around the guard.
- The demo call is data too: `src/lib/demo/demo-call.ts` (Demo Seed Pack). The seed script, the
  "Load Demo Call" button and the tests all read it, so they cannot drift.
- No `.env` is needed: `scripts/prisma.mjs` and `src/lib/db.ts` default `DATABASE_URL`. Use
  `npm run prisma -- <args>`, not bare `npx prisma`.

- Claude provider (`src/server/ai`, `src/lib/ai`): the model's answer is UNTRUSTED. It may choose, classify and quote;
  it may not supply a number a client sees. Quotes must be found in CLIENT sentences (`ground.ts`), hours and dollars
  are read by the app's own parsers from the sentence the model points at, wording it writes for a client goes through
  `guards.ts` (no new figures, promises, private/AI terms, contact details) and the strict schema, and anything that
  fails falls back to the mock with one content-free warning. The key is read from the environment only, in
  `server/ai/claude.ts`; never log, store or return it. Never add a model call to a path the demo depends on.
- What the model is SENT is a privacy boundary too: the reveal request carries only `narrativeInput(base)` (already
  client-safe), the prototype request only `prototypeFacts`. Add a field there and the tests that scan the request
  body must be updated on purpose.
- Which engine produced a snapshot is consultant-only (`EngineBadge`, `Session.coaching.provenance`). It has no field in
  the reveal or prototype schemas, and must not get one.
- Claude tests use `tests/stub-anthropic.ts` (a local Messages API). It proves the app's behaviour, not that the real
  service accepts the request; say so whenever you report on it.

## Testing
Run: `npm run typecheck && npm run lint && npm test`
Must pass before any feature is called complete: the privacy tests (`tests/privacy.test.tsx`,
`tests/reveal-route.test.tsx`), talk-ratio, tech-stack totals, and question-matching tests
(`tests/engine.test.ts`, which pins the engine to the Demo Seed Pack's expected outputs and
keeps a second, different call as a regression fixture).

## Lessons from building this (so they aren't re-learned)
- A guard test that passes with the guard deleted is not a test. Two guards that overlap (a digit check and a money
  check) each survive deleting the other: give each a case only it can catch (a percentage; a spelled-out amount).
- A test fixture can trip the guard it exercises: a stub answer containing the word "Claude" was (correctly) rejected as
  an AI mention. Read why a fallback happened before blaming the code.
- Test files must not import another test file for its fixtures (its tests register twice): share via a plain module.
- Test-isolation: a test that edits "the oldest consultant" (local mode) inherits whatever earlier tests left on it.
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
- Read the final screen after every edit feature: it showed every finance line relabelled "Entered" and two static
  sentences that edits had made false. Tests written from the same assumptions as the code do not find these.
- Read generated content, not just its tests: reading the prototype caught an internal-cost topic proposed as public
  content, a nonsensical "4 of 4 ... the rest are examples", and a placeholder budget phrased as an overrun.
- A forbidden-key list is per document: `severity` is private on the reveal but a normal field in the prototype's alerts.
- Grid items need `min-w-0` (and `grid-cols-[minmax(0,1fr)]`) or they refuse to shrink on a phone.
- Test hostile inputs against the real thing (a real local HTTP server for SSRF, real VTT exports for parsing),
  and mutate the guard to prove the test can fail.
