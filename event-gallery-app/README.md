# Event Gallery

A multi-tenant QR-code event photo/video sharing platform: guests scan a QR
code and upload straight into a live gallery — no app, no login. Hosts get a
full-screen browser slideshow (no software install), can publish gallery
media to social through **Blotato** or **GoHighLevel (GHL)**, and agencies
can resell it under their own branded domains.

> **Note on location:** this app was scaffolded inside the
> `tech-that-pays-comfyui` repo at the user's request, but it is a fully
> independent product with no shared code or infra with the rest of that
> repo. It's structured to be lifted into its own repository in one copy —
> just `git subtree split` this directory, or copy it into a fresh repo and
> `git init`.

## Feature set

- **Multi-tenant accounts**: Organization → Sub-account (a business/client) →
  Event, with role-based membership (`OWNER` / `ADMIN` / `STAFF`) scoped to
  either a whole org or a single sub-account.
- **QR code + guest upload**: unique per event, no login required, uploads go
  directly from the browser to object storage via presigned URLs.
- **Live gallery** and a **full-screen slideshow** (`/e/[slug]/present`) that
  auto-advances and live-updates as new photos come in — just a web page,
  playable on any smart TV browser, laptop-to-TV, or tablet.
- **Host dashboard**: moderate uploads, generate/download the QR code, manage
  social connections, and publish selected media to social.
- **Social publishing** via Blotato (`backend.blotato.com/v2`) or GHL
  (`services.leadconnectorhq.com/social-media-posting`) — publish now or
  schedule for later.
- **Billing** (Stripe): Free / Pro / Agency plans gating permanent storage,
  number of businesses per org, external storage sync, and white-label.
- **White-label custom domains**: an Agency-plan sub-account can point its
  own domain at the app; visiting its root redirects to that business's
  current live event.
- **External storage sync**: Pro-plan-and-up sub-accounts can connect Google
  Drive so approved uploads are auto-exported there as a standing backup.
- **Expiration**: events auto-expire 14 days after the event date unless
  `permanentStorage` is set (a paid-plan feature), cleaned up by a daily cron
  job.

**Deferred (see Roadmap):** direct native social posting (host's own
Instagram/TikTok/YouTube OAuth, bypassing Blotato/GHL) — blocked on you
registering developer apps with each platform and clearing their review
process, not on anything buildable here.

## Stack

Next.js 14 (App Router, TypeScript) · PostgreSQL via Prisma · S3-compatible
object storage (Cloudflare R2 or AWS S3) · Tailwind CSS · JWT session cookies
(`jose` + `bcryptjs`) · Stripe (billing) · Google APIs (Drive export).

## Setup

There are two ways to get a working environment: fully local (no cloud
accounts, fastest way to test the core photo/gallery/slideshow flow) or
pointed at real cloud services (needed for billing, white-label, and Drive
sync, and for an actual deployment).

### Option A — fully local, zero cloud accounts (recommended for a first look)

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/)
running locally.

```bash
cd event-gallery-app
npm install
docker compose up -d          # starts local Postgres + MinIO (S3-compatible)
cp local.env.example .env.local
npm run setup:local-storage   # creates the MinIO bucket + makes it public-read
npx prisma migrate dev --name init
npm run dev
```

Open `http://localhost:3000`. MinIO's web console (bucket browser) is at
`http://localhost:9001` (login: `minioadmin` / `minioadmin`), useful for
confirming uploaded files actually landed in the bucket. Billing, white-label
DNS, and Drive sync all need real external accounts (below) even in local
mode — the core upload/gallery/slideshow flow doesn't.

To stop: `docker compose down` (add `-v` to also wipe the local DB/bucket
data and start clean next time).

### Option B — real cloud services (for an actual deployment)

```bash
cd event-gallery-app
npm install
cp .env.example .env.local   # fill in every section below
npx prisma migrate dev --name init
npm run dev
```

Required for the core app:
- **Postgres** — e.g. [Neon](https://neon.tech) free tier.
- **S3-compatible bucket** — e.g. Cloudflare R2, with a public custom domain
  (or CDN) pointed at it for `STORAGE_PUBLIC_BASE_URL`, since the gallery and
  slideshow load media via plain public URLs.
- **AUTH_SECRET** — `openssl rand -hex 32`.

### Setting up Stripe billing

1. Create products/prices in the [Stripe dashboard](https://dashboard.stripe.com/test/products) —
   one recurring price for Pro, one for Agency. Copy each price ID into
   `STRIPE_PRICE_PRO` / `STRIPE_PRICE_AGENCY`.
2. Copy your test-mode secret key into `STRIPE_SECRET_KEY`.
3. Create a webhook endpoint pointed at `{APP_BASE_URL}/api/webhooks/stripe`
   listening for `checkout.session.completed`, `customer.subscription.updated`,
   and `customer.subscription.deleted`; copy its signing secret into
   `STRIPE_WEBHOOK_SECRET`. For local testing, use the
   [Stripe CLI](https://stripe.com/docs/stripe-cli): `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.
4. In the dashboard, go to an organization's **Billing** page to upgrade —
   this exercises the full Checkout → webhook → `planTier` update loop.

### Setting up white-label custom domains

1. Set `APP_HOSTNAMES` to a comma-separated list of the domain(s) this app
   itself is served on (not client domains) — e.g.
   `yourapp.vercel.app,yourapp.com`. Any other Host header hitting `/` is
   treated as a possible white-label domain (see `src/middleware.ts`).
2. On an Agency-plan sub-account, set a **custom domain** on its Settings
   page (e.g. `events.clientdomain.com`).
3. Outside this app: the client points that domain's DNS at your hosting
   provider (e.g. a CNAME to your Vercel deployment), and you add it as a
   custom domain in your hosting provider's dashboard so TLS/routing works.
   Once DNS resolves, visiting the domain's root redirects to that
   sub-account's current live event.

### Setting up Google Drive export

1. In the [Google Cloud Console](https://console.cloud.google.com/), create
   a project, enable the **Google Drive API**, and create an OAuth 2.0
   Client ID (Web application).
2. Add `{APP_BASE_URL}/api/integrations/google-drive/callback` as an
   authorized redirect URI.
3. Copy the client ID/secret into `GOOGLE_OAUTH_CLIENT_ID` /
   `GOOGLE_OAUTH_CLIENT_SECRET`.
4. While the OAuth consent screen is in "Testing" mode, add any Google
   accounts you'll test with as test users (Google caps this at 100 users
   until you submit for verification — fine for internal use, required before
   opening this up to arbitrary customers).
5. On a Pro-plan-or-higher sub-account's Settings page, click **Connect
   Google Drive**. Approved uploads then export via the
   `sync-external-storage` cron job.

## Verifying the core flow locally

1. `npm run dev`, sign up at `/signup`, create an organization, then a
   sub-account (business), then an event.
2. Open the event's guest link (`/e/<slug>`) on your phone (same network, or
   tunnel with `ngrok http 3000` and set `APP_BASE_URL` to the tunnel URL so
   the generated QR code points at it) and upload a photo. (With Option A's
   local MinIO, a phone on another network can't reach `localhost:9000` for
   the actual file bytes — either use Option B for phone-based testing, or
   test the upload/gallery/slideshow flow from your own machine's browser.)
3. Open `/e/<slug>/present` on a second screen — it should pick up the new
   photo within ~15s and play it full-screen.
4. In the dashboard, connect a Blotato or GHL sandbox/test credential under
   **Social connections**, approve an upload, and use **Publish to social**
   to confirm the request reaches the provider (check its dashboard/logs).
5. On the org's **Billing** page, upgrade to Pro/Agency in Stripe test mode
   and confirm the plan badge updates (via the webhook) and that
   permanent-storage / white-label / Drive-sync options unlock accordingly.

## Cron jobs (`vercel.json`)

All three are `GET` (Vercel Cron always invokes scheduled endpoints with
`GET`, not `POST`) and require `Authorization: Bearer $CRON_SECRET` — Vercel
Cron adds this automatically when `CRON_SECRET` is set as an env var; call
manually with the same header for local testing or another scheduler.

- `GET /api/cron/expire-events` — daily; deletes media for expired,
  non-permanent events.
- `GET /api/cron/dispatch-scheduled-posts` — every 15 min; fires any
  `ScheduledPost` whose `scheduledFor` time has passed.
- `GET /api/cron/sync-external-storage` — every 30 min; exports newly
  approved media to each sub-account's connected Google Drive.

## Known MVP simplifications

- No automatic image/video thumbnailing yet — the gallery/slideshow render
  full-size media directly. Add a `sharp`/ffmpeg pass on upload-confirm for
  real thumbnails before scaling to large galleries.
- `SocialConnection.credentialsJson` and
  `ExternalStorageConnection.refreshToken` are stored as plaintext —
  encrypt at rest (e.g. KMS envelope encryption) before handling real
  customer tokens.
- Google Drive export re-fetches each file from object storage and
  re-uploads it to Drive on the cron pass — fine at event-gallery scale, but
  a queue-based/streaming approach would scale better for very large events.
- White-label routing only special-cases the domain's root path; if you want
  every path (not just guest event pages) to feel branded under a custom
  domain, extend `src/middleware.ts`.

## Roadmap

- **Direct native social posting** (host's own Instagram/TikTok/YouTube via
  OAuth, bypassing Blotato/GHL) is the one remaining phase-2 item, and it's
  intentionally not built yet: each platform (Meta, TikTok, YouTube, …) needs
  its own developer app registered and, for posting on behalf of other
  users, its own app-review/approval process — accounts and approvals only
  you can obtain, not something buildable from here. Once you have developer
  app credentials for a given platform, add it as a new
  `SocialProvider`-style integration alongside `blotato.ts`/`ghl.ts`.
- Dropbox as a second external-storage-sync provider alongside Google Drive.
- Real thumbnailing pipeline (see Known MVP simplifications above).
