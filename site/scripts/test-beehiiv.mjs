#!/usr/bin/env node
// Verifies the Beehiiv integration end-to-end by creating a test
// subscription via the Beehiiv v2 API. Usage:
//   BEEHIIV_API_KEY=... BEEHIIV_PUBLICATION_ID=... npm run test:beehiiv [-- test@example.com]
const apiKey = process.env.BEEHIIV_API_KEY;
const pubId = process.env.BEEHIIV_PUBLICATION_ID;
const email = process.argv[2] || `insider-test+${Date.now()}@example.com`;

if (!apiKey || !pubId) {
  console.error("Set BEEHIIV_API_KEY and BEEHIIV_PUBLICATION_ID env vars first (see .env.example).");
  process.exit(1);
}

const res = await fetch(`https://api.beehiiv.com/v2/publications/${pubId}/subscriptions`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
  body: JSON.stringify({
    email,
    reactivate_existing: true,
    send_welcome_email: false,
    utm_source: "website-test"
  })
});
const body = await res.json().catch(() => ({}));
console.log(`Beehiiv API response: HTTP ${res.status}`);
console.log(JSON.stringify({ id: body?.data?.id, email: body?.data?.email, status: body?.data?.status }, null, 2));
process.exit(res.ok ? 0 : 1);
