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
       └─ fetch-places.mjs    Google Places API — cached, refreshed monthly
  └─ commit src/data/*.json → astro build → deploy
```

- **Copyright-safe by design:** news items are headline + short excerpt only,
  with visible source credit and a link out to the original article. Full
  articles are never republished.
- **Quota-safe:** Places results are cached in `src/data/places.json` and only
  re-fetched when older than 30 days (`places.cacheDays` in `site.config.mjs`),
  so the API is never hit on page loads.
- **Failure-safe:** if a feed is down, the previous data is kept — the site
  never goes blank.
- **Lead-magnet directory:** every business gets its own page on the site
  (`/directory/<category>/<business-slug>/`, statically generated at build
  time from `places.json`) instead of linking straight to their website —
  keeps visitors on the Insider site and gives every listing a "claim this
  listing" call-to-action pointing at `/advertise/`.

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
- **Removing a business from the directory:** the directory is a lead
  magnet, not user-submitted, so there's no login-protected admin panel —
  you (or a Claude session) edit
  [`src/data/excluded-places.json`](./src/data/excluded-places.json)
  directly on GitHub. Add an entry with the business's Google `place_id`
  (visible in `src/data/places.json` as each business's `id` field):
  ```json
  [{ "id": "ChIJ...", "note": "closed permanently", "excludedAt": "2026-07-14" }]
  ```
  Every future pipeline run filters this id out before the per-niche
  ranking/cap is applied, so a removed business never resurfaces and its
  slot is backfilled by the next-best real candidate — it takes effect on
  the next monthly refresh, or immediately if you trigger the workflow
  manually with `force_places: true`.
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

**Correction:** this section previously said the site bills at the Text
Search **Pro** SKU ($32/1,000, 5,000 free/month). That was wrong — the field
mask includes `rating`, `userRatingCount`, `regularOpeningHours`, and
`websiteUri`, all **Enterprise**-tier fields, so every Text Search call here
is billed at the Enterprise SKU: **$35/1,000 calls, 1,000 free/month**. This
doesn't change the bottom line below (still $0/month), just the safety
margin — worth knowing if you ever scale usage up further. Place Photo
pricing is unaffected: **$7/1,000 calls, 10,000 free/month** (Essentials SKU).

The directory targets ~100 businesses per niche (18 niches: 8 simple
categories + 10 Trades subcategories) via geographic query-splitting (see
below), refreshed monthly:

- 18 niches × 9 area variants = **162 Text Search calls/month** → 16.2% of
  the 1,000/month Enterprise free tier → **$0**
- 1 photo/business: realistic estimate ~900–1,300 Place Photo calls/month
  (narrow niches rarely hit the full 100-business ceiling) up to a
  worst-case ~1,800/month if every niche did → 9–18% of the 10,000/month
  free tier → **$0** either way

100 per niche is a **ceiling, not a guarantee** — a narrow trade like
Locksmiths may genuinely have fewer than 100 distinct real businesses in one
city even after splitting across neighborhoods; broad niches like
Restaurants are more likely to approach it. Photos are resolved to static
Google-hosted URLs during the pipeline, so site visitors never trigger API
calls.

### Growing a category past 20 results

Google's Text Search caps every query at 20 results — there's no pagination
past that. This directory grows past it two ways, stackable per category:

1. **By type** (`subcategories`) — `Trades & Home Services` is defined as 10
   trade-specific queries (Plumbers, Electricians, HVAC, Roofers,
   Landscaping, Painters, General Contractors, Locksmiths, Appliance Repair,
   Cleaning) instead of one vague query, each capped independently
   (`perSubcategory`) so one popular trade can't crowd out the others.
2. **By geography** (`places.areas`) — every category's query (simple or
   per-subcategory) is additionally run once per Mississauga neighborhood in
   `places.areas` and merged by Google's `place_id`, since even a
   type-specific query still caps at 20 on its own.

The directory page automatically renders subcategory groups as sub-headings.
Apply the type-splitting pattern to any other category (e.g. split "Health &
Wellness" into Dentists/Physio/Clinics) by adding a `subcategories` array in
place of its `query` — the geographic splitting applies automatically to any
category or subcategory, no extra config needed per-niche.

## Eventbrite note

Eventbrite retired its public location-search API in 2020, so "all events in
Mississauga" can no longer be queried directly. Instead, add the Eventbrite
organizer IDs of venues you care about (Living Arts Centre, Paramount Fine
Foods Centre, etc.) to `events.eventbriteOrganizers` in `site.config.mjs` and
set `EVENTBRITE_API_TOKEN`. City of Mississauga calendar events work without
any key.
