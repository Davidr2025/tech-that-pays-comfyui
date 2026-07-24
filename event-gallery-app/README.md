# Event Gallery

A multi-tenant QR-code event photo/video sharing platform: guests scan a QR
code and upload straight into a live gallery — no app, no login. Hosts get a
full-screen browser slideshow (no software install) and can publish gallery
media to social accounts through **Blotato** or **GoHighLevel (GHL)**.

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
  schedule for later. Direct native OAuth posting (bypassing both providers)
  is an intentional phase-2 item; see Roadmap below.
- **Expiration**: events auto-expire 14 days after the event date unless
  `permanentStorage` is set, cleaned up by a daily cron job.

## Stack

Next.js 14 (App Router, TypeScript) · PostgreSQL via Prisma · S3-compatible
object storage (Cloudflare R2 or AWS S3) · Tailwind CSS · JWT session cookies
(`jose` + `bcryptjs`) — no third-party auth/billing vendor wired in yet.

## Setup

```bash
cd event-gallery-app
npm install
cp .env.example .env.local   # fill in DATABASE_URL, AUTH_SECRET, STORAGE_*
npx prisma migrate dev --name init
npm run dev
```

Required services:
- **Postgres** — e.g. [Neon](https://neon.tech) free tier.
- **S3-compatible bucket** — e.g. Cloudflare R2, with a public custom domain
  (or CDN) pointed at it for `STORAGE_PUBLIC_BASE_URL`, since the gallery and
  slideshow load media via plain public URLs.
- **AUTH_SECRET** — `openssl rand -hex 32`.

## Verifying the core flow locally

1. `npm run dev`, sign up at `/signup`, create an organization, then a
   sub-account (business), then an event.
2. Open the event's guest link (`/e/<slug>`) on your phone (same network, or
   tunnel with `ngrok http 3000` and set `APP_BASE_URL` to the tunnel URL so
   the generated QR code points at it) and upload a photo.
3. Open `/e/<slug>/present` on a second screen — it should pick up the new
   photo within ~15s and play it full-screen.
4. In the dashboard, connect a Blotato or GHL sandbox/test credential under
   **Social connections**, approve an upload, and use **Publish to social**
   to confirm the request reaches the provider (check its dashboard/logs).

## Cron jobs (`vercel.json`)

- `POST /api/cron/expire-events` — daily; deletes media for expired,
  non-permanent events.
- `POST /api/cron/dispatch-scheduled-posts` — every 15 min; fires any
  `ScheduledPost` whose `scheduledFor` time has passed.

Both require `Authorization: Bearer $CRON_SECRET` — Vercel Cron adds this
automatically when `CRON_SECRET` is set as an env var; call manually with the
same header for local testing or another scheduler.

## Known MVP simplifications

- No automatic image/video thumbnailing yet — the gallery/slideshow render
  full-size media directly. Add a `sharp`/ffmpeg pass on upload-confirm for
  real thumbnails before scaling to large galleries.
- `SocialConnection.credentialsJson` is stored as plaintext JSON — encrypt at
  rest (e.g. KMS envelope encryption) before handling real customer tokens.
- No billing yet — every org currently gets full access.

## Roadmap (phase 2)

- Stripe billing + tier gating (permanent storage, recurring events, etc.)
- Direct native social posting (host's own Instagram/TikTok/YouTube via
  OAuth) — deferred because each platform requires its own app-review
  process; Blotato/GHL sidestep that for the MVP.
- External storage sync (Google Drive/Dropbox export).
- White-label / custom domains per organization.
