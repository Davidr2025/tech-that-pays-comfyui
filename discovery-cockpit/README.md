# Discovery Cockpit

An AI-assisted discovery-call tool for independent consultants. **Starter slice**: a working
vertical slice proving the core loop — live coaching for you, a clean review for your client.

- **Cockpit** (`/cockpit/[sessionId]`, private): transcript player, question checklist, and a coaching
  panel (decision readiness, pain points, buying signals, objections, reflect-back, next question,
  talk timer, talk ratio).
- **Client reveal** (`/reveal/[sessionId]`, client-safe): "What We Heard", pain points, every dollar the
  client mentioned in context, a tech-stack table with monthly and annual totals, and a today-vs-future panel.
  Print-optimised; **Download PDF** opens the print view.
- All "AI" is a deterministic, rule-based `MockAIEngine` (keywords, a dollar regex, tool-name matching).
  No network calls, no API keys.

> Working title only. Original code; no third-party product names, branding or copy.

## Run it

```bash
cd discovery-cockpit
npm install          # also runs `prisma generate`
npm run setup        # applies migrations + seeds the demo call (SQLite file, no .env needed)
npm run dev          # http://localhost:3000
```

Open the app, choose **Open cockpit** on the demo session, press **Load Demo Call**, then
**Build Client Review** and **Open Client Reveal**. The demo is the Demo Seed Pack call: Priya Nair, owner of
Brightline Marketing, a 9-person agency (20 segments, 772 words). Everything in it is fictitious.

| Command | What it does |
| --- | --- |
| `npm run typecheck` / `npm run lint` | `tsc --noEmit` / ESLint (flat config, Next rules) |
| `npm test` | Vitest: engine, parser, privacy, API handlers, hooks (uses its own `prisma/test.db`) |
| `npm run db:seed` / `db:reset` | Re-seed the demo / wipe and re-migrate |
| `npm run prisma -- <args>` | Prisma CLI with the default `DATABASE_URL` applied |

## The privacy boundary (the product)

The client must never see coaching, internal notes or decision readiness. It is enforced structurally,
not by convention:

1. Private data lives on `Session` (`coaching`, `internalNotes`, `decisionReadiness`) and `Extraction` rows.
2. The reveal reads **one column of one table**: `Report.revealData` (`src/server/reveal.ts`).
3. `buildRevealData` assembles that payload field by field from an explicit allow-list; it is then
   validated by a **strict zod schema** (`src/lib/reveal/schema.ts`) — an unknown key is an error — both
   when written and again when read. A tampered row makes the page fail closed.
4. `tests/privacy.test.tsx` and `tests/reveal-route.test.tsx` plant sentinel values in every private
   field, build a review, and assert none appear in the payload, the rendered markup, or the page
   `<head>`. They include negative controls (the detectors are shown to fail on leaks) and a static
   check that reveal code never references private fields.

Keep those tests green through the rest of the build.

## Demo Seed Pack: ground truth and where this build differs

`tests/engine.test.ts` pins the engine to the pack's "Expected coaching outputs", and keeps the earlier
Cedar Ridge HVAC call (`tests/fixtures/cedar-ridge.ts`) as a second call so the rules can't quietly
overfit one transcript. Against the pack:

| Pack says | Engine produces |
| --- | --- |
| 6 pain points: 3 high, 3 medium | 6: reporting, outsourced spend, lead follow-up (high); burnout/key-person, sales cycle, tool overlap (medium) |
| 9 dollar mentions | 9 (the pack lists 8 distinct amounts plus a non-dollar "3–4 leads"; the 9th is `$4,000` stated twice) |
| 5 costed tools, $1,174/mo, $14,088/yr | 5 costed tools, exactly those totals, plus Google Sheets listed as "Not stated" |
| 2 buying signals, 1 objection | exactly those |
| Readiness 70–75 | 70 |
| Suggested next question: price a recovered lead | exactly that, with the next bank question queued as "Then:" |
| Talk ratio 74% / 26% | 74% / 26% |

Judgement calls worth knowing:

- **Budget, urgency and who decides are "decision factors", not "buying signals".** The pack lists urgency
  separately from its 2 signals, and puts 2 signals in the call only if "mid-November" and "it's just me" are
  not counted as signals. They feed readiness and a Decision factors card instead.
- **Readiness weights were set so the pack's 70–75 holds.** No budget is stated in the call, so a client who is
  already paying a stated amount to work around the problem ($4,000/mo contractor) gets partial budget credit
  (8 of 15). Other factors: urgency 20, decision-maker 15, pain 15, cost of inaction 10, signals 5 each, objection −8.
- **"Talk timer should stay under 20s" is not quite true.** The 54-word opener is ~22s at 150 words per minute,
  so a 20s target trips on it; the default 30s target does not.
- **The pack's Google Sheets mention is kept** as an uncosted row; totals are unaffected.
- **Two questions end uncovered** (volume spikes, the one-fix question) because the consultant never asks them.

## Product decisions made (not specified in the prompt)

- **Location/stack**: `discovery-cockpit/` inside this repo; Next.js 15 (App Router), React 19, Tailwind 3,
  Prisma 6 + SQLite. shadcn/ui components are hand-written in `src/components/ui` (the shadcn CLI needs a
  remote registry); `components.json` is included so the CLI works later.
- **No `.env`**: `scripts/prisma.mjs` and `src/lib/db.ts` default `DATABASE_URL` to `prisma/dev.db`.
  Export `DATABASE_URL` to override. Schema uses enums and `Json`, so Postgres is a provider change plus
  a fresh baseline migration.
- **Only client speech is mined.** Pain points, dollars, tools, signals and objections come from the
  client's sentences; a price the consultant quotes never becomes a finding.
- **Reveal wording**: pain points use neutral category labels, not the client's raw words; severity is omitted.
  Dollar amounts show the client's own sentence, as the prompt requires — including a stated budget.
- **Tool costs**: an amount counts as a subscription only with a recurring period (or a recurring cue such as
  "plan"/"subscription", shown as "assumed monthly"). One-off amounts ("$2,400 in setup fees") are not
  assigned to tools. Annual/weekly bills are converted to monthly; annual totals use the true annual figure.
  Tools with no stated cost show "Not stated" and are excluded from totals.
- **Reveal timeline**: the reveal gets the client's own date phrases ("mid-November", "the next two to three
  weeks"), never the sentence they came from.
- **Contextual follow-up beats the bank**: a counted-but-unpriced problem ("3–4 leads a month") makes "what is
  one recovered lead worth?" the suggested question until the consultant asks it.
- **Playback**: segment N+1 appears after segment N has had time to be spoken (150 wpm ÷ speed; 1×/2×/4×/8×,
  default 4×). The talk timer follows the same call clock, so a 40-second monologue warns at 30s even at 8×.
- **A new transcript (demo or paste) is a new call**: all question ticks reset. *Restart* does too.
- **Build Client Review** uses the segments played so far, not the whole stored transcript.
- **Paste format**: `Consultant:`/`Client:` (also Me/Host, Customer/Prospect/Owner). Other names: first speaker
  is you. No labels: paragraphs alternate, starting with you.
- **No auth.** This is a local single-user slice; the reveal URL is an unguessable id, not access control.

## Known limits of the mock engine

Rules are keyword-based, so they are deliberately transparent and sometimes blunt:
a sentence matching two pain categories attributes the same quantified impact to both; time and counts
read number words ("ten to twelve hours") but dollars must be digits (`$85`, `$4.5k`), not "eighty-five
dollars" — a real speech-to-text feed needs a number-word normaliser; severity is a heuristic score
(`src/lib/mock-ai/engine.ts`, `extractPainPoints`); tool detection uses a fixed catalogue in
`src/lib/mock-ai/tools.ts`. The engine re-analyses the whole transcript-so-far on each new segment, which
is cheap here but conflicts with the pack's "incremental only" rule once a paid model is behind it. The engine sits behind a single
`analyze(segments)` function so a real model can replace it later.

## Layout

```
prisma/            schema, migration, seed
scripts/prisma.mjs Prisma CLI wrapper (default DATABASE_URL)
src/lib/mock-ai/   engine + rule tables (pain, cues, tools, question bank)
src/lib/reveal/    allow-list schema + payload builder
src/lib/demo/      the fictitious demo call (shared by seed, UI and tests)
src/server/        data access: sessions, questions, review (build), reveal (read)
src/app/           pages + API route handlers
src/components/    cockpit/, reveal/, ui/ (shadcn-style)
tests/             vitest suites
```
