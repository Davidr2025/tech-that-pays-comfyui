# Discovery Cockpit

An AI-assisted discovery-call tool for independent consultants. **Starter slice**: a working
vertical slice proving the core loop — live coaching for you, a clean review for your client.

- **Cockpit** (`/cockpit/[sessionId]`, private): transcript player, question checklist, and a coaching
  panel (decision readiness, pain points, buying signals, objections, reflect-back, next question,
  talk timer, talk ratio).
- **Client reveal** (`/reveal/[sessionId]`, client-safe): "What We Heard", pain points, every dollar the
  client mentioned in context, a conservative **What This Could Be Worth** estimate, a tech-stack table with monthly
  and annual totals, a today-vs-future panel, and **Next Steps** with a booking link (the client's own link, else
  your default). Print-optimised; **Download PDF** opens the print view.
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

## Pre-call setup

- **Settings** (`/settings`): your name, business, tagline, booking link, primary and accent colours, and a
  logo (PNG/JPEG/WebP/SVG under 150 KB, stored as a data URL and only ever shown inside an `<img>`).
- **Clients** (`/clients`): contact, company, website, booking link, and optional brand colours. **Detect from
  website** suggests colours from the page's `theme-color`, brand tokens and most-used colours; nothing is saved
  until you accept, and you can always pick colours by hand.
- **New session** (`/sessions/new`): choose the client, the type, and whose branding the review wears (yours or the
  client's; switchable later from the cockpit). All four types are available (see Assessment mode below).
- **Status** is `SETUP → LIVE → REVIEW → REVEALED → COMPLETED`, enforced in one place (`src/lib/sessions.ts`).
  Loading a transcript sets LIVE (and discards any review); building the review sets REVIEW; *Open Client Reveal*
  sets REVEALED; *Mark complete* sets COMPLETED, after which the transcript and review are locked.

## Assessment mode

Three assessment types (**operational**, **technology**, **combined**) alongside the discovery call.

- **Question banks**: 20 operational (`ops_*`) and 20 technology (`tech_*`) questions, each tagged to the lever it
  serves (efficiency, effectiveness, quality; plus governance for security). A combined session asks both (40, shown
  under Operations / Technology headings). Each session is judged against **its own bank**: an operations-only call
  never auto-checks a technology question. Detectors live in `src/lib/mock-ai/detectors.ts`.
- **Demo call**: *Load Demo Call* loads the discovery call for a discovery session and a 54-turn assessment
  follow-up (same fictitious agency) for the assessment types. The seed stages one of each.
- **Assessment facts** (`src/lib/mock-ai/assessment.ts`), mined from client sentences only: processes (with hours),
  security and governance gaps (shared logins, former staff with access, no multi-factor, client data in unapproved
  AI tools, untested backups, personal devices, a key account under a personal email, ...), finance figures
  (revenue, receivables, payroll, contractor spend; each dollar takes the nearest finance word) and content channels.
- **Prototype dashboard** (`/prototype/[sessionId]`, built together with the client review): four data-driven modules.
  **Client Nurture** (hot/warm/cold rows, days since contact, an expandable suggested action pointing at the client's
  own CRM), **Content Studio** (drafts with Approve / Edit / Reject, nothing "publishes"), **Financial Pulse**
  (budget bars, % used, remaining, a mock *Run Report*), **Security & Governance** (a live-style alert feed from the
  gaps the client admitted to), plus a tangled-vs-connected diagram drawn from their real tool list (also on the
  reveal). Always labelled PROTOTYPE.
- **What is real and what is invented**: figures the client stated are tagged *From your call*; every row the
  generator invents is tagged *Example* (and the schema refuses an invented row that doesn't say so). Budgets are
  placeholders. Draft topics come from the client's described problems, minus internal-cost ones.
- **Privacy**: the prototype is a second client-facing document, so it gets the reveal's treatment: strict
  per-module allow-list schemas applied on write and on read, a route that reads only `Report.revealData` and
  `PrototypeModule`, and its own sentinel/quote leak tests with negative controls. A stored module type nobody
  renders is skipped, so modules can be added or removed.
- **Checklist you can shape**: every question has a private note (autosaved), can be reworded (its topic, and so AI
  detection, stays), deleted, or joined by questions of your own (ticked by hand only: no detector knows them).
  The list splits into collapsible **Not yet asked** and **Covered**; what the cockpit suggests next follows your
  order, wording and deletions. Wording, adding and deleting freeze when a session is completed; notes do not.
- **Call notes** and an optional **encouragement line** (cockpit only; the on/off choice is a per-device setting, not
  stored in the database). Notes are private fields like coaching: tests plant sentinels for them and check the
  review, the prototype and every export.
- **Share** (cockpit, once a review is built): a dialog with an email draft to the client, **Copy for Gamma**
  (self-contained inline-styled HTML on the clipboard, plus a plain-text alternative), **Copy as text**, **Copy link**,
  and PDFs of the review and the prototype. The email is a `mailto:` link behind an `EmailProvider` interface: it
  opens *your* mail app, sends nothing itself, and cannot attach the PDF, so you attach it. Everything is built from
  the validated reveal payload only. The recipient comes from the client's optional email field.
- **Not built yet**: creating events through the Google Calendar API (it needs OAuth credentials; the `.ics` invitation
  below covers inviting the client without them), a pluggable calendar-provider setting, and the Claude provider.

## Transcript sources

One endpoint (`POST /api/sessions/[id]/transcript`), four sources:

| Source | How | Notes |
| --- | --- | --- |
| **Demo** | *Load Demo Call* | the Demo Seed Pack call |
| **Paste** | *Paste or upload* | labeled lines (`Consultant:`/`Client:`, `Name:`, `[Name] 10:01 AM: text`) or plain paragraphs |
| **Upload** | *Paste or upload → Choose file* | `.txt`, `.vtt`, `.srt` (Zoom/Teams captions); real timestamps drive replay pacing |
| **Manual** | *Type live* | type a line, press Enter; the speaker flips for you; lines are saved with timestamps |

Real names in a file (Zoom exports use them) trigger **Which speaker is you?**, defaulting to the speaker that
matches your name. Caption files with no names alternate turns by pause and warn you, with a **Swap** option if the
guess is backwards. Demo, paste and upload *replace* the transcript and reset the question ticks; typed lines *add*.

### Zoom and Google Meet

There is no live connection to either. Use their transcripts after the call, or paste the in-meeting transcript as
it grows. Zoom's cloud-recording transcript is a `.vtt` with speaker names; Meet's saved transcript is a Google Doc
whose speaker labels and timestamps are inconsistent (copy it into the paste box). A live feed needs Zoom's
Realtime Media Streams (gated, paid developer access) or a meeting-bot service; Google's Meet Media API is still a
developer preview. See the project notes before building either.

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
- **ROI estimate**: built only from figures the client stated. Hours use the low end of a range ("ten to twelve" is
  10), one sentence is counted once even if it describes two problems (Cedar Ridge's "15 hours" feeds two
  categories), and a team-wide admin figure is used only when no problem has its own hours. Per year = 48 working
  weeks; "could be recovered" = 50%, both printed as assumptions. Dollars for hours appear only when you set an
  hourly value on the client, and are labelled as your assumption. Stated dollar figures are listed separately and
  never summed (they can overlap). Every number is re-derived from its rows when the report is read, so an edited
  payload fails closed.
- **Exports**: the HTML for Gamma has no `<style>`, `<script>`, images or external references, and every string is
  escaped; tests check the tags and attributes against a short allow-list. I could not test the paste into Gamma
  itself, so how it renders there is unverified.
- **PDF**: the review and prototype both have a `?print=1` view that opens the browser's print dialog. Interactive
  controls (approve/edit/reject, Run Report) are hidden in print; modules flow across pages but rows stay whole.
- **A semi-functional prototype (owner-only edits)**: the signed-in owner (or anyone, in local mode) can approve,
  reject, reword or undo content drafts; enter the client's real finance figures (the bars and remaining amounts are
  recomputed); add or remove security alerts (filterable by severity for everyone); and add or remove real contacts.
  Everything saves to the database. A guest who opens the client link sees the same prototype with **no controls**: the
  write endpoint (`POST /api/sessions/[id]/prototype`) is behind the owner guard, takes a closed set of strict operations,
  and re-validates the whole module against its schema before storing. Provenance stays honest: a finance line becomes
  **Entered** only when its *actual* changes (resubmitting untouched lines does not relabel figures stated on the call);
  a contact you type is shown without an Example label; an alert you type keeps its Example label, because it is part of
  the demonstration. The sentence about where the figures came from is computed at render time, never stored.
  **Rebuilding the client review regenerates the prototype and discards these edits.**
- **Booking link**: the reveal shows a link, not an embedded widget. Only http(s) URLs pass the schema, so a stored
  `javascript:` address cannot reach an `href`.
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
- **Client-facing links are capability URLs.** `/reveal/<id>` and `/prototype/<id>` need no login by design (the client
  has none); the id is a random cuid, not access control. Anyone with the link can read that one document.

## Email, PDFs and calendar (optional, off by default)

Nothing here is needed for the demo. See `.env.example` for every variable.

- **Send from the app** (`SMTP_HOST` + `SMTP_FROM`, optionally `SMTP_USER`/`SMTP_PASS`): the Share dialog gains
  **Send to client**, behind a confirm click. Without SMTP the dialog opens a `mailto:` draft as before. It cannot be
  used as a mail relay: the recipient is **only the address on the client's record** (the request cannot supply one, a
  subject, text or a cc: the body schema is strict), the text is written by the app from the validated review, each
  consultant can send **10 an hour**, and every send is logged (the dialog shows "Last sent"). STARTTLS is required for
  any host that is not loopback. The mail server's error text is logged for the operator and never returned. The
  sender address is yours (`SMTP_FROM`); the consultant is the Reply-To.
- **PDF files** (`PDF_CHROMIUM_PATH`, or `npx playwright-core install chromium`): headless Chromium prints the same
  public view the browser would, so the file matches the screen (A4, controls hidden). It loads the app's own loopback
  address (never one derived from a request header), blocks every request to another origin while rendering, runs at
  most two at a time, and is limited to **20 an hour** per consultant. Without Chromium the Share dialog says so and the
  browser's Save as PDF still works. This adds `playwright-core` (no browser is downloaded with it).
- **Calendar**: the Share dialog can propose a follow-up time and attach a standard calendar invitation (`.ics`,
  `METHOD:REQUEST`) that invites the client in Google Calendar, Outlook and Apple Calendar, or download it to forward.
  Text fields are escaped so a title cannot inject calendar properties. **Creating events through the Google Calendar API
  is not built** (it needs OAuth credentials I could not test against).
- **Booking page inside the review** (Settings, off by default): only for Calendly, Cal.com, SavvyCal, TidyCal and
  YouCanBookMe, https only, in a sandboxed frame without top-navigation rights, hidden in print, with a plain button as
  the fallback. Embedding loads the provider's scripts and cookies in your client's browser, which is why it is opt-in.
  I could not load those providers from this environment, so how each one renders inside the frame is untested; the
  markup, the allowlist and the sandbox are.
- `npm audit` reports 9 issues in `next`/`tailwindcss` (via `postcss`) and Prisma's tooling (`deepmerge-ts`). They were
  there before these additions and none come from `nodemailer` or `playwright-core`.

## Accounts and access (security)

Two modes, chosen by `AUTH_MODE`:

- **`local`**: no login, one person on their own machine; "you" is the oldest consultant. This is the zero-config demo
  and the default for `npm run dev` and tests.
- **`accounts`**: sign-in required, every client/session/report belongs to one consultant, and nothing is shared.
  **A production build (`next build` + `next start`) with `AUTH_MODE` unset runs as `accounts`**, so a deployment is
  locked by default; running open in production takes an explicit `AUTH_MODE=local`. A typo such as `AUTH_MODE=acounts`
  also falls back to the safe choice.

How it works, and what it does not do:

- The first visitor creates the owner account; after that sign-up is closed unless the operator sets
  `ALLOW_SIGNUP=true`. Passwords are scrypt (N=2^17, r=8, p=1, per-hash salt; the cost is stored in the hash), 10 to 200
  characters, no composition rules. No email is sent, so there is **no self-service password reset**. If the owner forgets their password, an operator with
  database access must set a new `Consultant.passwordHash` (generate one with `hashPassword` in
  `src/lib/auth/password.ts`). [Likely] that is acceptable for one owner or a small team; it is not for a public product.
- A login is a random 256-bit token in an `httpOnly; SameSite=Lax` cookie (`Secure` in production; `COOKIE_SECURE=false`
  opts out for a plain-http local production build). Only its SHA-256 is stored, so a leaked database cannot be replayed
  as a cookie. Logins last 14 days (absolute, not sliding), die on sign-out, and a password change signs out every other
  device.
- State-changing requests that the browser marks cross-site are refused as well (defence in depth on top of `SameSite`).
- Five wrong passwords for one email, or twenty from one address, lock sign-in for 15 minutes. The limiter is in memory,
  so it is per server process. Because it is per email, anyone can lock the owner out for 15 minutes by guessing wrongly:
  that is a deliberate trade against online guessing.
- Someone else's session, client or question answers exactly like one that does not exist (404), so ids cannot be probed.
  An unknown email and a wrong password get the same message and take about the same time.
- Not built: email verification, MFA, per-device session lists, account deletion, roles/teams, audit log.

Adding a route? `tests/access.test.ts` imports every `route.ts` and every page and fails unless each is either guarded
(`guardSession`, `apiConsultant`, `requireConsultant`) or on the short public list in that file.

To move an existing local database to accounts mode, the oldest profile has no password. Sign up as a new owner (fresh,
empty account), or set a hash on the existing profile from a script using `hashPassword` in `src/lib/auth/password.ts`.

## Fetching a client's website (security)

Detecting brand colours makes the *server* fetch an address a user typed, which is a classic SSRF risk. The fetch
(`src/server/safe-fetch.ts`) allows only public http(s) on ports 80/443, rejects credentials in URLs, checks the
resolved address **at connect time** (so DNS tricks don't help), re-validates every redirect hop (max 4), caps size
and time, asks for uncompressed text, and refuses non-text responses. `localhost`, private ranges, link-local and the
cloud metadata address are refused. Tests run the guard against a real local server and fail if it is disabled.

## Known limits of the mock engine

Rules are keyword-based, so they are deliberately transparent and sometimes blunt:
a sentence matching two pain categories attributes the same quantified impact to both; time and counts
read number words ("ten to twelve hours") but dollars must be digits (`$85`, `$4.5k`), not "eighty-five
dollars" — a real speech-to-text feed needs a number-word normaliser; assessment extraction is the same kind of keyword rules (a gap must be stated in the client's own sentence;
a terse "no" to "is multi-factor on?" is not read); a bare "by hand" is only read as a pain inside a sentence about reports ("12 hours a week on invoices by hand"
is counted as lead-tracking, not manual work, unless it says re-entering or manual); severity is a heuristic score
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
src/lib/demo/      the fictitious demo calls: discovery + assessment (shared by seed, UI and tests)
src/lib/prototype/ prototype module schemas (allow-list) and the generator
src/components/    cockpit/, reveal/, prototype/, diagrams/, ui/ (shadcn-style)
src/lib/           transcript parsers, brand-colour detection, session status machine, validation
src/server/        data access: sessions, clients, consultant, questions, review (build), reveal (read), safe-fetch
src/app/           pages + API route handlers
src/components/    cockpit/, reveal/, ui/ (shadcn-style)
tests/             vitest suites
```
