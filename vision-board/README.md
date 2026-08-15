# David's AI Vision Board

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
the one place you're in the driver's seat, and it's four short steps:

1. **Create an Airtable token.** Go to
   [airtable.com/create/tokens](https://airtable.com/create/tokens) → Create
   token → name it "Vision Board" → scopes `data.records:read`,
   `data.records:write`, `schema.bases:read` → under Access, add both the
   **LSFG Coaching** base and the **LSFG Video Pipeline** base → Create
   token → copy it (you only see it once).
2. **Import this repo into Vercel.** [vercel.com/new](https://vercel.com/new)
   → import `davidr2025/tech-that-pays-comfyui` → in the project settings,
   set **Root Directory** to `vision-board` (this repo has more than one app
   in it, so this tells Vercel which one to build).
3. **Paste in three environment variables** (Project Settings → Environment
   Variables) — see `.env.example` in this folder for exactly what each one
   is:
   - `AIRTABLE_PAT` → the token from step 1
   - `VISION_BOARD_PASSWORD` → `harbor-forge-vista-1421` (generated for you;
     change it to anything, any time, right here — no redeploy needed to
     take effect on the next request)
   - `SESSION_SECRET` → `uCmerhzWU9BJylRjuoj0fnz_qhPryeS20Qtbbh9akR4`
4. **Click Deploy.** Vercel gives you a `https://<something>.vercel.app`
   URL — that's your private link. Bookmark it on every device.

Redeploying later (pushing new code) never touches your data — everything
you add, edit, or write lives in Airtable, completely separate from the
deployed code.

## Local development

There's no local dev server wired up (Edge Functions need Vercel's runtime).
To preview layout/design changes only, serve the folder statically —
`npx serve .` or `python3 -m http.server` — and the pages will render, but
anything that calls `/api/*` will fail until it's deployed (or run through
the Vercel CLI's `vercel dev`, if you install it later).
