/**
 * Who is making this request, and may they touch this record.
 *
 * Local mode (see lib/auth/mode.ts) has no login: "you" is the oldest consultant and every guard allows.
 * Accounts mode requires a valid login cookie, and a record is only reachable by the consultant who owns
 * it. A record that belongs to someone else answers exactly like one that does not exist (404), so ids
 * cannot be probed.
 */
import type { Consultant } from "@prisma/client";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { prisma } from "../lib/db";
import { jsonError } from "../lib/api";
import { authMode } from "../lib/auth/mode";
import { consultantForToken, SESSION_DAYS } from "./accounts";

export const COOKIE = "dc_session";

export async function readToken(): Promise<string | undefined> {
  return (await cookies()).get(COOKIE)?.value;
}

export async function setLoginCookie(token: string, expiresAt: Date) {
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // Browsers will not keep a Secure cookie over plain http (Safari, even on localhost), so a local
    // production build can opt out. Anything on the internet should keep this on.
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
    maxAge: SESSION_DAYS * 24 * 3600,
  });
}

export async function clearLoginCookie() {
  (await cookies()).set(COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
}

/** The signed-in consultant (accounts mode) or the one local consultant (local mode); null if none. */
export async function currentConsultant(): Promise<Consultant | null> {
  if (authMode() === "local") return prisma.consultant.findFirst({ orderBy: { createdAt: "asc" } });
  return consultantForToken(await readToken());
}

/** For pages: in accounts mode, sends visitors without a login to /login. */
export async function requireConsultant(): Promise<Consultant | null> {
  const c = await currentConsultant();
  if (!c && authMode() === "accounts") redirect("/login");
  return c;
}

/**
 * A browser on another site can make the visitor's browser send our cookie. SameSite=Lax already blocks
 * that for POST/PUT/PATCH/DELETE; this refuses it again if the browser says the request came from elsewhere.
 */
export function crossSite(req: Request): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return false;
  if (req.headers.get("sec-fetch-site") === "cross-site") return true;
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return !host || new URL(origin).host !== host;
  } catch {
    return true;
  }
}

export const unauthorized = () => jsonError("Sign in to continue.", 401);

/** For API routes that act on the signed-in consultant. Returns the consultant (null only in local mode with no profile) or a ready response. */
export async function apiConsultant(req: Request): Promise<{ consultant: Consultant | null } | { error: NextResponse }> {
  if (authMode() === "local") return { consultant: await currentConsultant() };
  if (crossSite(req)) return { error: jsonError("Cross-site request refused.", 403) };
  const consultant = await currentConsultant();
  return consultant ? { consultant } : { error: unauthorized() };
}

/**
 * For every route keyed by a session id: null if the caller may proceed, otherwise the response to
 * return. A session someone else owns is a plain 404.
 */
export async function guardSession(req: Request, sessionId: string): Promise<NextResponse | null> {
  if (authMode() === "local") return null;
  const who = await apiConsultant(req);
  if ("error" in who) return who.error;
  const owned = await prisma.session.count({ where: { id: sessionId, consultantId: who.consultant!.id } });
  return owned ? null : jsonError("Session not found.", 404);
}

/** Same rule for pages: a session that is not yours is a 404 page. */
export async function ownsSession(sessionId: string): Promise<boolean> {
  if (authMode() === "local") return true;
  const c = await currentConsultant();
  return c ? (await prisma.session.count({ where: { id: sessionId, consultantId: c.id } })) > 0 : false;
}
