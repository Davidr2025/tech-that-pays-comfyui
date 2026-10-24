import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { revokeToken } from "@/server/accounts";
import { clearLoginCookie, crossSite, readToken } from "@/server/auth";

/** Needs no login: signing out when you are already out is fine. */
export async function POST(req: Request) {
  if (crossSite(req)) return jsonError("Cross-site request refused.", 403);
  await revokeToken(await readToken());
  await clearLoginCookie();
  return NextResponse.json({ ok: true });
}
