/** Passwords, tokens, lockout and the account rules. No request context needed. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authMode, signupOpen } from "@/lib/auth/mode";
import { burnVerifyTime, hashPassword, passwordProblem, scryptCost, verifyPassword } from "@/lib/auth/password";
import { makeLimiter } from "@/lib/auth/rate-limit";
import { prisma } from "@/lib/db";
import { AuthError, authenticate, changePassword, consultantForToken, createLogin, emailLimiter, hasOwner, ipLimiter, revokeToken, sha256, signup } from "@/server/accounts";

afterEach(() => vi.unstubAllEnvs());

let n = 0;
const fresh = () => ({ name: "Test Owner", businessName: "Owner Co", email: `owner-${Date.now()}-${n++}@example.test`, password: "correct horse battery" });
const OPEN = { ALLOW_SIGNUP: "true" };
const code = async (p: Promise<unknown>) => ((await p.then(() => null, (e) => e)) as AuthError | null)?.code ?? null;

describe("password hashing", () => {
  it("never stores the password, salts every hash, and verifies only the right one", async () => {
    const a = await hashPassword("correct horse battery");
    const b = await hashPassword("correct horse battery");
    expect(a).not.toContain("correct horse");
    expect(a).not.toBe(b); // a fresh salt each time
    expect(a.split("$")).toHaveLength(6);
    expect(await verifyPassword("correct horse battery", a)).toBe(true);
    expect(await verifyPassword("correct horse batterY", a)).toBe(false);
    expect(await verifyPassword("", a)).toBe(false);
  });

  it("refuses to verify against nothing or something malformed", async () => {
    for (const bad of [null, undefined, "", "plaintext", "scrypt$1$2$3", "bcrypt$a$b$c$d$e", "scrypt$x$8$1$AAAA$AAAA"]) {
      expect(await verifyPassword("anything", bad), String(bad)).toBe(false);
    }
  });

  it("carries its own cost, so raising the cost later does not lock anyone out", async () => {
    const cheap = await hashPassword("a long enough password");
    expect(cheap.split("$")[1]).toBe(String(scryptCost()));
    vi.stubEnv("NODE_ENV", "production"); // only the cost for NEW hashes changes
    expect(await verifyPassword("a long enough password", cheap)).toBe(true);
  });

  it("uses the recommended cost (N=2^17) outside tests", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(scryptCost()).toBe(2 ** 17);
    vi.stubEnv("NODE_ENV", "development");
    expect(scryptCost()).toBe(2 ** 17);
    vi.stubEnv("NODE_ENV", "test");
    expect(scryptCost()).toBeLessThan(2 ** 17);
  });

  it("burnVerifyTime runs without throwing (it only exists to equalise timing)", async () => {
    await expect(burnVerifyTime("whatever")).resolves.toBeUndefined();
  });

  it.each([
    ["short", "abc", /at least 10/],
    ["too long", "x".repeat(201) + "y", /under 200/],
    ["the email address", "me@example.test", /cannot be your email/],
    ["one repeated character", "aaaaaaaaaaaa", /repetitive/],
  ])("rejects a password that is %s", (_n, pw, message) => {
    expect(passwordProblem(pw, "me@example.test")).toMatch(message);
  });
  it("accepts a long passphrase with no symbols (length, not character-class rules)", () => {
    expect(passwordProblem("correct horse battery staple", "me@example.test")).toBeNull();
  });
});

describe("rate limiter", () => {
  it("locks after `max` failures, reports the wait, and forgets as time passes", () => {
    let t = 0;
    const l = makeLimiter({ max: 3, windowMs: 60_000, now: () => t });
    expect(l.retryAfter("k")).toBe(0);
    l.fail("k");
    l.fail("k");
    expect(l.retryAfter("k")).toBe(0);
    l.fail("k");
    expect(l.retryAfter("k")).toBe(60);
    t = 30_000;
    expect(l.retryAfter("k")).toBe(30);
    expect(l.retryAfter("other")).toBe(0); // keys are independent
    t = 60_001;
    expect(l.retryAfter("k")).toBe(0);
  });
  it("clear() resets a key", () => {
    const l = makeLimiter({ max: 1, windowMs: 1000 });
    l.fail("k");
    expect(l.retryAfter("k")).toBeGreaterThan(0);
    l.clear("k");
    expect(l.retryAfter("k")).toBe(0);
  });
});

describe("auth mode", () => {
  it.each([
    [{}, "local"],
    [{ NODE_ENV: "development" }, "local"],
    [{ NODE_ENV: "test" }, "local"],
    [{ NODE_ENV: "production" }, "accounts"], // a deployment is safe by default
    [{ NODE_ENV: "production", AUTH_MODE: "local" }, "local"], // open only when spelled out
    [{ NODE_ENV: "development", AUTH_MODE: "accounts" }, "accounts"],
    [{ NODE_ENV: "production", AUTH_MODE: "nonsense" }, "accounts"], // a typo must not open the door
    [{ NODE_ENV: "production", AUTH_MODE: " ACCOUNTS " }, "accounts"],
  ])("%j -> %s", (env, expected) => {
    expect(authMode(env)).toBe(expected);
  });
  it("sign-up is open for the first owner, then only if the operator allows it", () => {
    expect(signupOpen(false, {})).toBe(true);
    expect(signupOpen(true, {})).toBe(false);
    expect(signupOpen(true, { ALLOW_SIGNUP: "true" })).toBe(true);
    expect(signupOpen(true, { ALLOW_SIGNUP: "yes" })).toBe(false);
  });
});

describe("signup", () => {
  it("creates an account whose password is hashed and whose email is lower-cased by the schema", async () => {
    const input = fresh();
    const c = await signup(input, OPEN);
    expect(c.passwordHash).toMatch(/^scrypt\$/);
    expect(c.passwordHash).not.toContain(input.password);
    expect(await verifyPassword(input.password, c.passwordHash)).toBe(true);
  });

  it("refuses a weak password and a taken email", async () => {
    const input = fresh();
    expect(await code(signup({ ...input, password: "short" }, OPEN))).toBe("INVALID");
    await signup(input, OPEN);
    expect(await code(signup(input, OPEN))).toBe("CONFLICT");
  });

  it("closes once an owner exists, unless the operator opens it", async () => {
    await signup(fresh(), OPEN);
    expect(await hasOwner()).toBe(true);
    expect(await code(signup(fresh(), {}))).toBe("FORBIDDEN");
    await expect(signup(fresh(), OPEN)).resolves.toBeTruthy();
  });
});

describe("signing in", () => {
  beforeEach(() => {
    emailLimiter.clear("x");
  });

  it("returns the account for the right password", async () => {
    const input = fresh();
    const c = await signup(input, OPEN);
    expect((await authenticate(input.email, input.password, "1.1.1.1")).id).toBe(c.id);
  });

  it("answers the same way for an unknown email, a wrong password and a profile with no login", async () => {
    const input = fresh();
    await signup(input, OPEN);
    const noLogin = await prisma.consultant.create({ data: { name: "No Login", email: `nologin-${Date.now()}@example.test`, businessName: "X" } });
    const messages: string[] = [];
    for (const [email, pw] of [
      [input.email, "wrong password here"],
      [`nobody-${Date.now()}@example.test`, "whatever password"],
      [noLogin.email, "whatever password"],
    ] as const) {
      const err = (await authenticate(email, pw, "2.2.2.2").catch((e) => e)) as AuthError;
      expect(err.code).toBe("UNAUTHORIZED");
      messages.push(err.message);
    }
    expect(new Set(messages).size).toBe(1); // no way to tell which one it was
  });

  it("locks an email after five wrong passwords, even for the right one, and unlocks on success afterwards", async () => {
    const input = fresh();
    await signup(input, OPEN);
    for (let i = 0; i < 5; i++) expect(await code(authenticate(input.email, "wrong password!", `10.0.0.${i}`))).toBe("UNAUTHORIZED");
    const locked = (await authenticate(input.email, input.password, "10.0.0.99").catch((e) => e)) as AuthError;
    expect(locked.code).toBe("LOCKED");
    expect(locked.retryAfter).toBeGreaterThan(0);
    expect(locked.message).toMatch(/Try again in \d+ minutes?/);
    emailLimiter.clear(input.email);
    await expect(authenticate(input.email, input.password, "10.0.0.99")).resolves.toBeTruthy();
  });

  it("a successful sign-in clears the failure count", async () => {
    const input = fresh();
    await signup(input, OPEN);
    for (let i = 0; i < 4; i++) await authenticate(input.email, "wrong password!", "3.3.3.3").catch(() => undefined);
    await authenticate(input.email, input.password, "3.3.3.3");
    expect(emailLimiter.retryAfter(input.email)).toBe(0);
    await authenticate(input.email, "wrong password!", "3.3.3.3").catch(() => undefined);
    expect(emailLimiter.retryAfter(input.email)).toBe(0); // one failure, not five
  });

  it("locks an address that sprays many different emails", async () => {
    for (let i = 0; i < 20; i++) await authenticate(`spray-${i}-${Date.now()}@example.test`, "guess guess guess", "9.9.9.9").catch(() => undefined);
    expect(ipLimiter.retryAfter("9.9.9.9")).toBeGreaterThan(0);
    expect(await code(authenticate(fresh().email, "guess guess guess", "9.9.9.9"))).toBe("LOCKED");
    ipLimiter.clear("9.9.9.9");
  });
});

describe("login tokens", () => {
  it("are random, resolved to their owner, and stored only as a hash", async () => {
    const c = await signup(fresh(), OPEN);
    const a = await createLogin(c.id);
    const b = await createLogin(c.id);
    expect(a.token).not.toBe(b.token);
    expect(a.token.length).toBeGreaterThanOrEqual(40);
    expect((await consultantForToken(a.token))?.id).toBe(c.id);
    const rows = await prisma.authSession.findMany({ where: { consultantId: c.id } });
    expect(JSON.stringify(rows)).not.toContain(a.token); // a leaked database cannot be replayed as a cookie
    expect(rows.map((r) => r.tokenHash)).toContain(sha256(a.token));
  });

  it("rejects unknown, empty, oversized and tampered tokens", async () => {
    const c = await signup(fresh(), OPEN);
    const { token } = await createLogin(c.id);
    for (const bad of [undefined, "", "short", "x".repeat(200), token.slice(0, -1) + (token.endsWith("A") ? "B" : "A"), `${token} `]) {
      expect(await consultantForToken(bad), String(bad)).toBeNull();
    }
  });

  it("expire after 14 days, and an expired one is removed when it is seen", async () => {
    const c = await signup(fresh(), OPEN);
    const { token, expiresAt } = await createLogin(c.id);
    expect(expiresAt.getTime() - Date.now()).toBeGreaterThan(13.9 * 24 * 3600_000);
    expect(expiresAt.getTime() - Date.now()).toBeLessThan(14.1 * 24 * 3600_000);
    expect(await consultantForToken(token, new Date(expiresAt.getTime() - 1000))).toBeTruthy();
    expect(await consultantForToken(token, new Date(expiresAt.getTime() + 1000))).toBeNull();
    expect(await prisma.authSession.count({ where: { tokenHash: sha256(token) } })).toBe(0);
  });

  it("stop working once revoked", async () => {
    const c = await signup(fresh(), OPEN);
    const { token } = await createLogin(c.id);
    await revokeToken(token);
    expect(await consultantForToken(token)).toBeNull();
    await expect(revokeToken(undefined)).resolves.toBeUndefined();
  });

  it("die with the account", async () => {
    const c = await signup(fresh(), OPEN);
    const { token } = await createLogin(c.id);
    await prisma.consultant.delete({ where: { id: c.id } });
    expect(await consultantForToken(token)).toBeNull();
  });
});

describe("changing a password", () => {
  it("needs the current one, and applies the same strength rules", async () => {
    const input = fresh();
    const c = await signup(input, OPEN);
    expect(await code(changePassword(c.id, "not my password", "a brand new passphrase"))).toBe("UNAUTHORIZED");
    expect(await code(changePassword(c.id, input.password, "short"))).toBe("INVALID");
    expect(await verifyPassword(input.password, (await prisma.consultant.findUniqueOrThrow({ where: { id: c.id } })).passwordHash)).toBe(true);
  });

  it("signs out every other device but keeps the one that made the change", async () => {
    const input = fresh();
    const c = await signup(input, OPEN);
    const here = await createLogin(c.id);
    const phone = await createLogin(c.id);
    await changePassword(c.id, input.password, "a brand new passphrase", here.token);
    expect(await consultantForToken(here.token)).toBeTruthy();
    expect(await consultantForToken(phone.token)).toBeNull();
    await expect(authenticate(input.email, "a brand new passphrase", "4.4.4.4")).resolves.toBeTruthy();
    expect(await code(authenticate(input.email, input.password, "4.4.4.4"))).toBe("UNAUTHORIZED");
  });
});
