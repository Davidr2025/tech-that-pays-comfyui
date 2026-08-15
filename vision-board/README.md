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
the one place you're in the driver's seat. The button below pre-fills the
tricky settings (which folder to build, which env vars to ask for) so it's
three real steps instead of four:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Davidr2025/tech-that-pays-comfyui&root-directory=vision-board&env=AIRTABLE_PAT,VISION_BOARD_PASSWORD,SESSION_SECRET&envDescription=Airtable%20token%2C%20the%20login%20password%2C%20and%20a%20session-signing%20secret%20-%20see%20vision-board%2F.env.example%20for%20what%20each%20one%20is.&envLink=https://github.com/Davidr2025/tech-that-pays-comfyui/blob/main/vision-board/.env.example&project-name=ai-vision-board)

1. **Create an Airtable token first** (the button can't do this part — it's
   a separate site). Go to
   [airtable.com/create/tokens](https://airtable.com/create/tokens) → Create
   token → name it "Vision Board" → scopes `data.records:read`,
   `data.records:write`, `schema.bases:read` → under Access, add both the
   **LSFG Coaching** base and the **LSFG Video Pipeline** base → Create
   token → copy it (you only see it once).
2. **Click the button above.** It opens Vercel already pointed at this repo,
   `main`, and the `vision-board` folder, with the three env var names
   already listed — you just paste in the values (the Airtable token from
   step 1, plus the password and session secret from chat) and click Deploy.
   If Vercel's wizard asks whether to fork this into a new repo of your own
   vs. importing it directly, choose to import it directly — you already own
   this repo.
3. **Bookmark the `https://<something>.vercel.app` URL** it gives you on
   every device.

<details>
<summary>Prefer to do it by hand instead of the button?</summary>

1. [vercel.com/new](https://vercel.com/new) → import
   `davidr2025/tech-that-pays-comfyui` → set **Root Directory** to
   `vision-board`.
2. Project Settings → Environment Variables → add `AIRTABLE_PAT`,
   `VISION_BOARD_PASSWORD`, `SESSION_SECRET` (see `.env.example`).
3. Click Deploy.

</details>

Redeploying later (pushing new code) never touches your data — everything
you add, edit, or write lives in Airtable, completely separate from the
deployed code.

## Local development

There's no local dev server wired up (Edge Functions need Vercel's runtime).
To preview layout/design changes only, serve the folder statically —
`npx serve .` or `python3 -m http.server` — and the pages will render, but
anything that calls `/api/*` will fail until it's deployed (or run through
the Vercel CLI's `vercel dev`, if you install it later).
