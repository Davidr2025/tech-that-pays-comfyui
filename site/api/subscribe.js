// Vercel Serverless Function: POST /api/subscribe
// Env vars (Project → Settings → Environment Variables):
//   BEEHIIV_API_KEY, BEEHIIV_PUBLICATION_ID
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const email = req.body?.email;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: "Please enter a valid email address" });
  }
  const { BEEHIIV_API_KEY, BEEHIIV_PUBLICATION_ID } = process.env;
  if (!BEEHIIV_API_KEY || !BEEHIIV_PUBLICATION_ID) {
    return res.status(503).json({ ok: false, error: "Newsletter signup is not configured yet" });
  }
  const r = await fetch(
    `https://api.beehiiv.com/v2/publications/${BEEHIIV_PUBLICATION_ID}/subscriptions`,
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${BEEHIIV_API_KEY}` },
      body: JSON.stringify({
        email, reactivate_existing: true, send_welcome_email: true,
        utm_source: "website", utm_medium: "organic"
      })
    }
  );
  if (!r.ok) return res.status(502).json({ ok: false, error: "Signup failed — please try again" });
  return res.status(200).json({ ok: true });
}
