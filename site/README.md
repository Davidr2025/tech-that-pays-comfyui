# Mississauga Insider — self-updating local site

Static Astro site + automated content pipeline for the Mississauga Insider
newsletter. It fetches local news, events, weather, sports and business
listings on a schedule, commits the data, rebuilds and redeploys — hands-off.

## How it works

```
GitHub Actions (every 6 hours)
  └─ node scripts/update-content.mjs
       ├─ fetch-news.mjs      RSS: City of Mississauga, insauga, CBC Toronto, Toronto Star
       ├─ fetch-events.mjs    City events calendar (REST/iCal) + optional Eventbrite organizers
       ├─ fetch-weather.mjs   Open-Meteo (no key needed)
       ├─ fetch-sports.mjs    TheSportsDB (best effort)
       └─ fetch-places.mjs    Google Places API — cached, refreshed weekly
  └─ commit src/data/*.json → astro build → deploy
```

- **Copyright-safe by design:** news items are headline + short excerpt only,
  with visible source credit and a link out to the original article. Full
  articles are never republished.
- **Quota-safe:** Places results are cached in `src/data/places.json` and only
  re-fetched when older than 7 days (`places.cacheDays` in `site.config.mjs`),
  so the API is never hit on page loads.
- **Failure-safe:** if a feed is down, the previous data is kept — the site
  never goes blank.

## Commands (run inside `site/`)

| Command                  | What it does                            |
| ------------------------ | --------------------------------------- |
| `npm install`            | install dependencies                    |
| `npm run update-content` | run the full content pipeline           |
| `npm run build`          | build the static site to `dist/`        |
| `npm run dev`            | local dev server                        |
| `npm run test:beehiiv`   | send a test subscription to Beehiiv     |

## Configuration

- **Branding, colors, feeds, categories:** everything lives in
  [`site.config.mjs`](./site.config.mjs) — one file.
- **Featured business (paid slot):** edit
  [`src/data/featured-business.json`](./src/data/featured-business.json).
- **API keys:** copy [`.env.example`](./.env.example) to `.env` locally, and add
  the same names as **GitHub Actions secrets** (repo → Settings → Secrets and
  variables → Actions → New repository secret):
  `BEEHIIV_API_KEY`, `BEEHIIV_PUBLICATION_ID`, `GOOGLE_PLACES_API_KEY`,
  `EVENTBRITE_API_TOKEN` (optional). Also add the two Beehiiv vars in your
  deploy host's dashboard for the `/api/subscribe` function.

## Deploying (all free)

The GitHub Actions workflow publishes the built site to the `gh-pages` branch
on every run. To turn on the free GitHub Pages URL
(`https://davidr2025.github.io/tech-that-pays-comfyui/`) it takes **one click**:
repo → Settings → Pages → Source: *Deploy from a branch* → `gh-pages` → Save.
(GitHub requires an admin to enable Pages; the workflow token can't.)

For a nicer domain + working `/api/subscribe` endpoint, connect one of:

- **Cloudflare Pages (recommended):** dashboard → Workers & Pages → connect this
  repo → root directory `site`, build `npm run build`, output `dist`. The
  `functions/api/subscribe.js` endpoint is picked up automatically. Set
  `SITE_URL=https://your-domain` env var, plus the two Beehiiv vars.
- **Netlify:** repo root already has `netlify.toml` — just connect the repo.
- **Vercel:** import repo, set root directory to `site` (`vercel.json` included).

Each host redeploys automatically whenever the pipeline commits fresh data.

## Automated weekly newsletter

`.github/workflows/newsletter.yml` runs every **Thursday 7 a.m. Toronto time**:
it refreshes all content, composes a complete branded issue
(`npm run build-newsletter` → `site/newsletter/latest.html` + subject/preview
in `latest.json`), commits it, and delivers it per `NEWSLETTER_MODE`:

| Mode | What happens | Requirement |
| ---- | ------------ | ----------- |
| `dry-run` (default) | Issue composed & saved only | none |
| `draft` | Draft created in beehiiv — you click **Send** | beehiiv Create Post API access |
| `publish` / `schedule` | Fully hands-off send | beehiiv **Send API** (Enterprise beta — [request access](https://www.beehiiv.com/support/article/29286794539671-how-to-access-the-beehiiv-send-api)) |

Set the mode as a GitHub repo **variable** (`Settings → Secrets and variables →
Actions → Variables → NEWSLETTER_MODE`). Manual runs: Actions → "Weekly
newsletter" → Run workflow → pick a mode.

**No Enterprise plan?** Two good options: (1) keep `dry-run` and paste
`latest.html` into a beehiiv post (2 minutes/week), or (2) connect the
[official beehiiv MCP](https://www.beehiiv.com/support/article/39255979546263-getting-started-with-the-beehiiv-mcp)
to Claude and have a weekly Claude routine push the composed issue into a
beehiiv draft automatically (works on any paid beehiiv plan; publishing stays
one click in the beehiiv app).

## Google Places cost estimate

Weekly refresh: 7 simple categories × 10 results, plus Trades & Home
Services split into 10 trade-specific queries × 8 results each (see below):

- 17 Text Search (Pro SKU) calls/week ≈ **74/month** — free tier is 5,000/month
- ~150 Place Photo (Essentials SKU) calls/week ≈ **650/month** — free tier is 10,000/month

**Estimated cost: $0/month** (roughly 1.5% of the Text Search free tier, 6.5%
of the Photo free tier). Even daily refreshes stay comfortably free. Photos
are resolved to static Google-hosted URLs during the pipeline, so site
visitors never trigger API calls.

### Growing a category past 20 results

Google's Text Search caps every query at 20 results — there's no pagination
past that. `Trades & Home Services` shows how to grow past it: instead of one
vague query, it's defined as `subcategories` (Plumbers, Electricians, HVAC,
Roofers, Landscaping, Painters, General Contractors, Locksmiths, Appliance
Repair, Cleaning) in `site.config.mjs`, each running its own Text Search and
capped independently (`perSubcategory`, default 8) so one popular trade can't
crowd out the others. The directory page automatically renders these as
sub-headings within the category. Apply the same pattern to any other
category (e.g. split "Health & Wellness" into Dentists/Physio/Clinics) by
adding a `subcategories` array in place of its `query`.

## Eventbrite note

Eventbrite retired its public location-search API in 2020, so "all events in
Mississauga" can no longer be queried directly. Instead, add the Eventbrite
organizer IDs of venues you care about (Living Arts Centre, Paramount Fine
Foods Centre, etc.) to `events.eventbriteOrganizers` in `site.config.mjs` and
set `EVENTBRITE_API_TOKEN`. City of Mississauga calendar events work without
any key.
