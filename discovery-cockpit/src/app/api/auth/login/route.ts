import { NextResponse } from "next/server";
import { errorResponse, jsonError, readBody } from "@/lib/api";
import { authMode } from "@/lib/auth/mode";
import { loginSchema } from "@/lib/auth/schemas";
import { authenticate, createLogin } from "@/server/accounts";
import { crossSite, setLoginCookie } from "@/server/auth";

/** First address in X-Forwarded-For when behind a proxy; it can be spoofed, so the per-email limit is the one that matters. */
const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

export async function POST(req: Request) {
  if (authMode() === "local") return jsonError("This server runs without accounts.", 409);
  if (crossSite(req)) return jsonError("Cross-site request refused.", 403);
  const parsed = await readBody(req, loginSchema);
  if ("error" in parsed) return parsed.error;
  try {
    const consultant = await authenticate(parsed.data.email, parsed.data.password, clientIp(req));
    const login = await createLogin(consultant.id);
    await setLoginCookie(login.token, login.expiresAt);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Could not sign in.");
  }
}
