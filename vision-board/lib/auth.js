// Session signing & verification, and the password check.
// Runs on Vercel's Edge runtime (middleware + every /api function), which
// only has the standard Web Crypto API — no Node "crypto" module — so
// everything here is written against globalThis.crypto.subtle, which also
// happens to work unchanged in modern Node. One implementation, every runtime.

const SESSION_COOKIE = "vb_session";
const SESSION_MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000; // 60 days — this is a "open it every morning" tool

function toBase64Url(bytes) {
  let bin = "";
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromBase64Url(str) {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function hmacSign(secret, message) {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return toBase64Url(sig);
}

async function hmacVerify(secret, message, signatureB64Url) {
  const key = await hmacKey(secret);
  return crypto.subtle.verify("HMAC", key, fromBase64Url(signatureB64Url), new TextEncoder().encode(message));
}

/** Build a signed session token: base64url(payload).base64url(signature) */
export async function createSessionToken(secret) {
  const payload = JSON.stringify({ exp: Date.now() + SESSION_MAX_AGE_MS });
  const payloadB64 = toBase64Url(new TextEncoder().encode(payload));
  const sig = await hmacSign(secret, payloadB64);
  return `${payloadB64}.${sig}`;
}

/** Returns true only if the token is well-formed, signed with our secret, and not expired. */
export async function verifySessionToken(token, secret) {
  if (!token || typeof token !== "string" || !token.includes(".")) return false;
  const [payloadB64, sig] = token.split(".");
  try {
    const ok = await hmacVerify(secret, payloadB64, sig);
    if (!ok) return false;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64)));
    return typeof payload.exp === "number" && Date.now() < payload.exp;
  } catch {
    return false;
  }
}

/** Constant-shape comparison: hash both sides with the session secret before comparing. */
export async function passwordMatches(submitted, expected, secret) {
  if (!submitted || !expected) return false;
  const [a, b] = await Promise.all([hmacSign(secret, submitted), hmacSign(secret, expected)]);
  return a === b;
}

export function readCookie(request, name = SESSION_COOKIE) {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

export function sessionCookieHeader(token, { clear = false } = {}) {
  const base = `${SESSION_COOKIE}=${clear ? "" : token}; Path=/; HttpOnly; Secure; SameSite=Lax`;
  return clear ? `${base}; Max-Age=0` : `${base}; Max-Age=${Math.floor(SESSION_MAX_AGE_MS / 1000)}`;
}

export async function requestIsAuthed(request, secret) {
  const token = readCookie(request);
  return verifySessionToken(token, secret);
}

export { SESSION_COOKIE };
