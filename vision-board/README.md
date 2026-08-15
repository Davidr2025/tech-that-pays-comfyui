# David's AI Vision Board

**Live at [ceo-dashboard-ls.vercel.app](https://ceo-dashboard-ls.vercel.app/)**
(Vercel project `ceo-dashboard`, team `limitless6`). Bookmark that URL, not
a branch-preview link — preview URLs change per-branch, this one doesn't.

A private, password-protected command center: Present Builds, Future Builds,
a Scratch Pad, and an auto-written Activity Log, plus a dedicated CEO view
per project. All of it reads and writes straight from the **LSFG Coaching**
Airtable base — this app has no database of its own, so there's only ever
one place your real numbers live.

## How it's built

- **Frontend:** plain HTML/CSS/JS. No framework, no build step.
- **Backend:** Vercel Edge Functions under `/api` — every one requires a
  valid session cookie (checked by `middleware.js`) before it does anything.
- **Data:** the Airtable REST API, called server-side only from `lib/airtable.js`.
  Your Airtable token never reaches the browser.
- **Auth:** a password you set, turned into a signed session cookie
  (`lib/auth.js`) using the browser/runtime's built-in Web Crypto — no
  third-party auth service, nothing to configure beyond the two secrets below.

## What's already wired up

- **Present/Future Builds** = the `Businesses` table in the **LSFG Coaching**
  base, extended with `Section`, `Health`, `What Winning Looks Like`,
  `Next Move`, and `Blockers` fields. Your existing `Role`,
  `Current/Target Monthly Revenue`, `90-Day Priority`, and `Notes` fields
  were left untouched.
- **Scratch Pad** = the new `Scratchpad Notes` table in that same base.
- **Recent Activity** = the new `Vision Board Activity` table — written to
  automatically by every add/edit/promote/delete, never by hand.
- **Mississauga Insider CEO view** = the real dashboard already built from
  `tech-that-pays-comfyui/site`'s own data (directory size, monetization
  funnel, content pipeline health).
- **Tech That Pays CEO view** = live from the `Videos` table in your
  **LSFG Video Pipeline** base (pipeline stage counts, spend, leads).

Every other business on the board (Limitless Mortgage, Limitless Customers,
Limitless Capital) shows its financials and next move right on its card —
they don't have a dedicated CEO view page yet because there's no wired data
source for them yet. Tell me what each one's real data lives in (a CRM? a
spreadsheet? another Airtable base?) and that's a quick follow-up, the same
way Mississauga Insider and Tech That Pays were built.

## Deploying (the only non-code part)

I can't click buttons in your Vercel or Airtable accounts for you — this is
the one place you're in the driver's seat.

(A pre-filled "Deploy with Vercel" button used to live here. Dropped it —
Vercel's link-based pre-fill only works when you're cloning someone *else's*
template into a new repo of your own; since you already own this repo, it
silently ignores every query-string setting and drops you into the plain
import screen with Root Directory and Environment Variables missing. The
steps below are the real path, confirmed against what Vercel actually shows.)

1. **Create an Airtable token.** Go to
   [airtable.com/create/tokens](https://airtable.com/create/tokens) → Create
   token → name it "Vision Board" → scopes `data.records:read`,
   `data.records:write`, `schema.bases:read` → under Access, add both the
   **LSFG Coaching** base and the **LSFG Video Pipeline** base → Create
   token → copy it (you only see it once).
2. **Go to [vercel.com/new](https://vercel.com/new)** and search for
   `tech-that-pays-comfyui` in the repo list — click it directly from the
   list rather than pasting a URL, so Vercel treats it as importing your own
   existing repo (this is what actually reveals the settings in step 3,
   instead of the stripped-down screen a pasted link produces).
3. On the **Configure Project** screen: set **Root Directory** to
   `vision-board`, then open **Environment Variables** and add
   `AIRTABLE_PAT` (the token from step 1), `VISION_BOARD_PASSWORD`, and
   `SESSION_SECRET` (the last two from chat — see `.env.example` for what
   each one is).
4. **Click Deploy.** Bookmark the `https://<something>.vercel.app` URL it
   gives you on every device.

Redeploying later (pushing new code) never touches your data — everything
you add, edit, or write lives in Airtable, completely separate from the
deployed code.

## Local development

There's no local dev server wired up (Edge Functions need Vercel's runtime).
To preview layout/design changes only, serve the folder statically —
`npx serve .` or `python3 -m http.server` — and the pages will render, but
anything that calls `/api/*` will fail until it's deployed (or run through
the Vercel CLI's `vercel dev`, if you install it later).
