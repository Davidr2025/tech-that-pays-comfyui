import { createSessionToken, passwordMatches, sessionCookieHeader } from "../lib/auth.js";

export const config = { runtime: "edge" };

export default async function handler(request) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  let password = "";
  try {
    ({ password } = await request.json());
  } catch {
    return new Response(JSON.stringify({ error: "Bad request" }), { status: 400 });
  }

  const secret = process.env.SESSION_SECRET;
  const expected = process.env.VISION_BOARD_PASSWORD;
  const ok = await passwordMatches(password, expected, secret);

  if (!ok) {
    return new Response(JSON.stringify({ error: "Wrong password" }), { status: 401 });
  }

  const token = await createSessionToken(secret);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": sessionCookieHeader(token)
    }
  });
}
