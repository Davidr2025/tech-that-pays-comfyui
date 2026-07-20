# Mississauga Insider — self-updating local site

Static Astro site + automated content pipeline for the Mississauga Insider
newsletter. It fetches local news, events, weather, sports and business
listings on a schedule, commits the data, rebuilds and redeploys — hands-off.

## How it works

```
GitHub Actions (every 6 hours, anchored to 6:15am/12:15pm/6:15pm/12:15am ET)
  └─ node scripts/update-content.mjs
       ├─ fetch-news.mjs      RSS: City of Mississauga, insauga, Mississauga.com, CBC Toronto, Toronto Star
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
- **Manually curated content:** [`src/data/recommendations.json`](./src/data/recommendations.json)
  holds hand-written, evergreen "free things to do" recommendations (nature
  walks, trails, parks) shown alongside the auto-fetched events on the
  homepage and `/events/`. It is edited directly and is never touched by the
  automated pipeline — add, remove or update entries any time.
- **Freshness-anchored:** the schedule is timed so a run always lands 15
  minutes after local outlets' typical morning news wave (~6am Eastern), not
  just every 6 hours from an arbitrary UTC start — see the cron comment in
  `.github/workflows/update-content.yml`.
- **Lead-magnet directory:** every business gets its own page on the site
  (`/directory/<category>/<business-slug>/`, statically generated at build
  time from `places.json`) instead of linking straight to their website —
  keeps visitors on the Insider site and gives every listing a "claim this
  listing" call-to-action pointing at `/advertise/`.

## Guides (hand-authored, not pipeline-generated)

`/guides/` is a separate, **manually written** section — original
neighbourhood guides and explainers, not aggregated or paraphrased from other
outlets' reporting. This is deliberate: rewriting other publishers' articles
under our own byline (even lightly reworded) is a real copyright/plagiarism
risk, which is exactly what the news pipeline's "excerpt + credit + link out"
model above is designed to avoid. Guides exist to give the site original,
brandable content without that risk.

To add a guide: drop a new `.md` file in `site/src/content/guides/` with
frontmatter matching the schema in `site/src/content/config.ts`
(`title`, `description`, `publishDate`, optional `updatedDate`) — it's picked
up automatically at build time via Astro content collections
(`src/pages/guides/index.astro` and `[slug].astro`). No pipeline changes, no
API keys, no scheduled job — just Markdown.

## Business Spotlight (two tiers)

`/spotlight/` is the same hand-authored content-collection pattern as Guides
(`site/src/content/spotlights/*.md`), but for full articles about one
business. Two tiers, controlled by the `tier` frontmatter field:

- `tier: basic` (default): a free foot-in-the-door piece, no payment
  required. Real site content on its own, and useful as something concrete
  to show a business when pitching them on a paid placement.
- `tier: paid`: the deliverable for the "Featured Business Spotlight"
  package on `/advertise/`. Shows a "Featured Partner" tag, and the business
  should also be set as the homepage hero (`site/src/data/featured-business.json`,
  set `enabled: true` and `spotlightSlug` to the article's filename so the
  homepage teaser links through to the full article).

Frontmatter schema (see `site/src/content/config.ts`): `title`,
`businessName`, `category`, `tier`, `description`, `publishDate`, optional
`updatedDate`, `website`, `photo`. To cross-link with a business's real
directory listing, set `directoryCategory` and `directorySlug` to match its
entry in `places.json` (its category slug and business slug) — the business's
own directory page then shows a banner linking to the spotlight article.

## Commands (run inside `site/`)

| Command                  | What it does                            |
| ------------------------ | --------------------------------------- |
| `npm install`            | install dependencies                    |
| `npm run update-content` | run the full content pipeline           |
| `npm run build`          | build the static site to `dist/`        |
| `npm run dev`            | local dev server                        |
| `npm run test:beehiiv`   | send a test subscription to Beehiiv     |
| `npm run export-csv`     | export the directory as `exports/businesses.csv` |

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
- **CSV export for outreach/CRM import:** `npm run export-csv` (also runs
  automatically as part of the content pipeline) writes every directory
  business to [`exports/businesses.csv`](./exports/businesses.csv), one row
  per business with its live profile page URL included — useful for "claim
  your listing" outreach emails or importing into a CRM (e.g. GHL). Set
  `SITE_URL` when running manually if it should point somewhere other than
  the production domain.
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

### Custom domain (GitHub Pages)

The workflow is wired to serve **mississaugainsider.ca** from GitHub Pages:
`update-content.yml`'s deploy step sets `cname: mississaugainsider.ca`
(writes/preserves a `CNAME` file in `gh-pages` on every deploy — without it, a
fresh deploy can silently drop a manually-set custom domain), and the build
step sets `SITE_URL`/`BASE_PATH` for a root-served custom domain instead of
the `<owner>.github.io/<repo>/` project-pages path.

Add these DNS records at your registrar (apex domains can't use a CNAME
record, so GitHub Pages requires A records to their 4 IPs):

```
A       @     185.199.108.153
A       @     185.199.109.153
A       @     185.199.110.153
A       @     185.199.111.153
CNAME   www   davidr2025.github.io.
```

Once DNS propagates, repo → Settings → Pages will show the domain as
verified — then enable **Enforce HTTPS** there (GitHub auto-provisions the
cert, usually within ~15–60 min of DNS resolving).

**Caveat:** GitHub Pages is static-only — it can't run the
`functions/api/subscribe.js` endpoint the way Cloudflare Pages/Netlify/Vercel
can. On GitHub Pages, set `newsletterUrl` in `site.config.mjs` to your beehiiv
hosted subscribe page so the site's subscribe form has somewhere to send
visitors; without it the form has no working backend on this host.

## Automated weekly newsletter

`.github/workflows/newsletter.yml` runs every **Thursday 7 a.m. Toronto time**:
it refreshes all content, composes a complete branded issue
(`npm run build-newsletter` → `site/newsletter/latest.html` + subject/preview
in `latest.json`), commits it, and delivers it per `NEWSLETTER_MODE`:

| Mode | What happens | Requirement |
| ---- | ------------ | ----------- |
| `dry-run` (default) | Issue composed & saved only | none |
| `draft` | Draft created in beehiiv — you click **Send** | beehiiv Create Post API — **included in the free Launch plan** |
| `publish` / `schedule` | Fully hands-off send | beehiiv **Send API** (Enterprise beta — [request access](https://www.beehiiv.com/support/article/29286794539671-how-to-access-the-beehiiv-send-api)) |

Set the mode as a GitHub repo **variable** (`Settings → Secrets and variables →
Actions → Variables → NEWSLETTER_MODE`). Manual runs: Actions → "Weekly
newsletter" → Run workflow → pick a mode.

**On the free plan:** beehiiv's free Launch plan includes general API access
(everything except the Send API), so `draft` mode works today — set
`BEEHIIV_API_KEY` / `BEEHIIV_PUBLICATION_ID` (from beehiiv → Settings → API
keys) as repo secrets and `NEWSLETTER_MODE=draft` as a repo variable, and the
pipeline pushes a ready-to-send draft into beehiiv every week automatically.
Only `publish`/`schedule` need the Enterprise Send API.

Note: the [official beehiiv MCP](https://www.beehiiv.com/support/article/39255979546263-getting-started-with-the-beehiiv-mcp)
is **read-only on free plans** — write access (creating/pushing drafts via
MCP) needs a paid beehiiv plan. On free, the direct API path above (`draft`
mode) is the better option; it already works without any beehiiv upgrade.

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
