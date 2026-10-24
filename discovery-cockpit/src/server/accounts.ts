/**
 * Accounts, without any request context: the rules for signing up, signing in, and the lifetime of a
 * login. `auth.ts` adds the cookie plumbing on top. A login is a random token in an httpOnly cookie;
 * only its SHA-256 is stored.
 */
import { createHash, randomBytes } from "node:crypto";
import type { Consultant } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/db";
import { signupOpen } from "../lib/auth/mode";
import { burnVerifyTime, hashPassword, passwordProblem, verifyPassword } from "../lib/auth/password";
import { makeLimiter } from "../lib/auth/rate-limit";
import type { signupSchema } from "../lib/auth/schemas";

export class AuthError extends Error {
  constructor(
    public code: "INVALID" | "CONFLICT" | "UNAUTHORIZED" | "LOCKED" | "FORBIDDEN",
    message: string,
    public retryAfter = 0,
  ) {
    super(message);
  }
}

export const SESSION_DAYS = 14;
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Five wrong passwords for one email, or twenty from one address, lock further tries for 15 minutes. */
export const emailLimiter = makeLimiter({ max: 5, windowMs: 15 * 60_000 });
export const ipLimiter = makeLimiter({ max: 20, windowMs: 15 * 60_000 });

export async function hasOwner(): Promise<boolean> {
  return (await prisma.consultant.count({ where: { passwordHash: { not: null } } })) > 0;
}

export async function createLogin(consultantId: string, now = new Date()) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 24 * 3600_000);
  await prisma.authSession.create({ data: { consultantId, tokenHash: sha256(token), expiresAt } });
  // Tidy up: expired logins are useless, and this keeps the table from growing for ever.
  await prisma.authSession.deleteMany({ where: { expiresAt: { lt: now } } });
  return { token, expiresAt };
}

/** The consultant a cookie token belongs to, or null if it is unknown, expired or malformed. */
export async function consultantForToken(token: string | undefined, now = new Date()): Promise<Consultant | null> {
  if (!token || token.length < 20 || token.length > 100) return null;
  const row = await prisma.authSession.findUnique({ where: { tokenHash: sha256(token) }, include: { consultant: true } });
  if (!row) return null;
  if (row.expiresAt <= now) {
    await prisma.authSession.delete({ where: { id: row.id } }).catch(() => undefined);
    return null;
  }
  return row.consultant;
}

export async function revokeToken(token: string | undefined) {
  if (token) await prisma.authSession.deleteMany({ where: { tokenHash: sha256(token) } });
}

export async function signup(input: z.output<typeof signupSchema>, env: Record<string, string | undefined> = process.env): Promise<Consultant> {
  if (!signupOpen(await hasOwner(), env)) throw new AuthError("FORBIDDEN", "Sign-up is closed on this server. Ask the owner for an account.");
  const problem = passwordProblem(input.password, input.email);
  if (problem) throw new AuthError("INVALID", problem);
  if (await prisma.consultant.count({ where: { email: input.email } })) {
    throw new AuthError("CONFLICT", "An account with that email already exists. Sign in instead.");
  }
  try {
    return await prisma.consultant.create({
      data: { name: input.name, businessName: input.businessName, email: input.email, passwordHash: await hashPassword(input.password) },
    });
  } catch {
    // Lost a race with another sign-up for the same email (the unique index caught it).
    throw new AuthError("CONFLICT", "An account with that email already exists. Sign in instead.");
  }
}

const BAD_LOGIN = "That email and password do not match.";

export async function authenticate(email: string, password: string, ip: string): Promise<Consultant> {
  const wait = Math.max(emailLimiter.retryAfter(email), ipLimiter.retryAfter(ip));
  if (wait > 0) throw new AuthError("LOCKED", `Too many attempts. Try again in ${Math.ceil(wait / 60)} minute${wait > 60 ? "s" : ""}.`, wait);

  const consultant = await prisma.consultant.findUnique({ where: { email } });
  const ok = consultant?.passwordHash ? await verifyPassword(password, consultant.passwordHash) : (await burnVerifyTime(password), false);
  if (!ok || !consultant) {
    emailLimiter.fail(email);
    ipLimiter.fail(ip);
    throw new AuthError("UNAUTHORIZED", BAD_LOGIN);
  }
  emailLimiter.clear(email);
  return consultant;
}

/** Changes the password and signs out every other device. `keepToken` is the login making the change. */
export async function changePassword(consultantId: string, current: string, next: string, keepToken?: string) {
  const c = await prisma.consultant.findUnique({ where: { id: consultantId } });
  if (!c) throw new AuthError("UNAUTHORIZED", "Sign in again.");
  if (!(await verifyPassword(current, c.passwordHash))) throw new AuthError("UNAUTHORIZED", "Your current password is not right.");
  const problem = passwordProblem(next, c.email);
  if (problem) throw new AuthError("INVALID", problem);
  await prisma.consultant.update({ where: { id: consultantId }, data: { passwordHash: await hashPassword(next) } });
  await prisma.authSession.deleteMany({ where: { consultantId, ...(keepToken ? { tokenHash: { not: sha256(keepToken) } } : {}) } });
}
