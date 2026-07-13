// Netlify Function: exposed at /api/subscribe via redirect in netlify.toml
// Env vars (Site settings → Environment variables):
//   BEEHIIV_API_KEY, BEEHIIV_PUBLICATION_ID
export default async (request) => {
  const json = (data, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "content-type": "application/json" }
    });
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  let email;
  try {
    ({ email } = await request.json());
  } catch {
    return json({ ok: false, error: "Invalid request body" }, 400);
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ ok: false, error: "Please enter a valid email address" }, 400);
  }
  const { BEEHIIV_API_KEY, BEEHIIV_PUBLICATION_ID } = process.env;
  if (!BEEHIIV_API_KEY || !BEEHIIV_PUBLICATION_ID) {
    return json({ ok: false, error: "Newsletter signup is not configured yet" }, 503);
  }
  const res = await fetch(
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
  if (!res.ok) return json({ ok: false, error: "Signup failed — please try again" }, 502);
  return json({ ok: true });
};

export const config = { path: "/api/subscribe" };
