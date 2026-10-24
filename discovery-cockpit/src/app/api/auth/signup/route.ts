import { NextResponse } from "next/server";
import { errorResponse, jsonError, readBody } from "@/lib/api";
import { authMode } from "@/lib/auth/mode";
import { signupSchema } from "@/lib/auth/schemas";
import { createLogin, signup } from "@/server/accounts";
import { crossSite, setLoginCookie } from "@/server/auth";

export async function POST(req: Request) {
  if (authMode() === "local") return jsonError("This server runs without accounts.", 409);
  if (crossSite(req)) return jsonError("Cross-site request refused.", 403);
  const parsed = await readBody(req, signupSchema);
  if ("error" in parsed) return parsed.error;
  try {
    const consultant = await signup(parsed.data);
    const login = await createLogin(consultant.id);
    await setLoginCookie(login.token, login.expiresAt);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return errorResponse(err, "Could not create the account.");
  }
}
