// Cloudflare Pages Function: POST /api/subscribe
// Creates a subscription in your Beehiiv publication. Set these in the
// Cloudflare Pages dashboard (Settings → Environment variables):
//   BEEHIIV_API_KEY, BEEHIIV_PUBLICATION_ID
export async function onRequestPost({ request, env }) {
  const json = (data, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "content-type": "application/json" }
    });

  let email;
  try {
    ({ email } = await request.json());
  } catch {
    return json({ ok: false, error: "Invalid request body" }, 400);
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ ok: false, error: "Please enter a valid email address" }, 400);
  }
  if (!env.BEEHIIV_API_KEY || !env.BEEHIIV_PUBLICATION_ID) {
    return json({ ok: false, error: "Newsletter signup is not configured yet" }, 503);
  }

  const res = await fetch(
    `https://api.beehiiv.com/v2/publications/${env.BEEHIIV_PUBLICATION_ID}/subscriptions`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.BEEHIIV_API_KEY}`
      },
      body: JSON.stringify({
        email,
        reactivate_existing: true,
        send_welcome_email: true,
        utm_source: "website",
        utm_medium: "organic"
      })
    }
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`Beehiiv error ${res.status}: ${detail.slice(0, 300)}`);
    return json({ ok: false, error: "Signup failed — please try again" }, 502);
  }
  return json({ ok: true });
}
