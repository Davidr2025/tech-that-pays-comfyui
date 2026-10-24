/// <reference types="vite/client" />
/**
 * Accounts mode over HTTP: the auth routes, and proof that one consultant cannot reach another's data.
 * `next/headers` is replaced with a cookie jar so the real handlers run unchanged.
 */
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();
let lastCookieOptions: Record<string, unknown> | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string, options?: Record<string, unknown>) => {
      lastCookieOptions = options;
      if (value === "" || options?.maxAge === 0) jar.delete(name);
      else jar.set(name, value);
    },
  }),
}));

import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { PUT as changePasswordRoute } from "@/app/api/auth/password/route";
import { POST as signupRoute } from "@/app/api/auth/signup/route";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { COOKIE, crossSite } from "@/server/auth";
import { createLogin, emailLimiter, ipLimiter } from "@/server/accounts";
import { makeDemoSession } from "./helpers";

const req = (url: string, method: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://app.test${url}`, { method, headers: { "Content-Type": "application/json", host: "app.test", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

beforeAll(() => {
  vi.stubEnv("AUTH_MODE", "accounts");
});
afterAll(() => vi.unstubAllEnvs());
beforeEach(() => {
  jar.clear();
  lastCookieOptions = undefined;
  emailLimiter.clear("x");
  ipLimiter.clear("unknown");
});

let counter = 0;
/** A consultant with a password, a client and a session, plus a login token. */
async function makeAccount(label: string) {
  const s = await makeDemoSession(label);
  const password = `passphrase-${label}-${counter++}`;
  const consultant = await prisma.consultant.update({ where: { id: s.consultantId }, data: { passwordHash: await hashPassword(password) } });
  const { token } = await createLogin(consultant.id);
  return { consultantId: consultant.id, email: consultant.email, password, sessionId: s.id, clientId: s.clientId, token };
}
const as = (who: { token: string } | null) => (who ? jar.set(COOKIE, who.token) : jar.delete(COOKIE));

describe("POST /api/auth/signup", () => {
  it("creates the first owner and signs them in with a safe cookie", async () => {
    await prisma.consultant.updateMany({ data: { passwordHash: null } }); // no owner yet
    const email = `first-${Date.now()}@example.test`;
    const res = await signupRoute(req("/api/auth/signup", "POST", { name: "First Owner", businessName: "First Co", email: email.toUpperCase(), password: "a long first passphrase" }));
    expect(res.status).toBe(201);
    expect(jar.get(COOKIE)).toBeTruthy();
    expect(lastCookieOptions).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    expect((lastCookieOptions!.maxAge as number) / 86400).toBe(14);
    expect(await prisma.consultant.findUnique({ where: { email } })).toMatchObject({ name: "First Owner" }); // stored lower-case
  });

  it("is closed once there is an owner", async () => {
    await makeAccount("owner-exists");
    const res = await signupRoute(req("/api/auth/signup", "POST", { name: "Late", businessName: "Late Co", email: `late-${Date.now()}@example.test`, password: "a long late passphrase" }));
    expect(res.status).toBe(403);
    expect(jar.size).toBe(0);
  });

  it("can be opened by the operator", async () => {
    await makeAccount("owner-exists-2");
    vi.stubEnv("ALLOW_SIGNUP", "true");
    const res = await signupRoute(req("/api/auth/signup", "POST", { name: "Invited", businessName: "Inv Co", email: `inv-${Date.now()}@example.test`, password: "a long invited passphrase" }));
    vi.stubEnv("ALLOW_SIGNUP", "");
    expect(res.status).toBe(201);
  });

  it.each([
    ["an unknown field", { name: "A", businessName: "B", email: "a@b.co", password: "long enough password", isAdmin: true }],
    ["a bad email", { name: "A", businessName: "B", email: "nope", password: "long enough password" }],
    ["no name", { name: "", businessName: "B", email: "a@b.co", password: "long enough password" }],
  ])("rejects %s", async (_n, body) => {
    await prisma.consultant.updateMany({ data: { passwordHash: null } });
    expect((await signupRoute(req("/api/auth/signup", "POST", body))).status).toBe(400);
  });
});

describe("POST /api/auth/login", () => {
  it("signs in, sets the cookie, and the token resolves to the account", async () => {
    const a = await makeAccount("login");
    const res = await login(req("/api/auth/login", "POST", { email: a.email.toUpperCase(), password: a.password }));
    expect(res.status).toBe(200);
    expect(jar.get(COOKIE)).toBeTruthy();
    expect(jar.get(COOKIE)).not.toBe(a.token); // a new login, not a reused one
  });

  it("answers 401 with one message for a wrong password and an unknown email, and sets no cookie", async () => {
    const a = await makeAccount("login-bad");
    const wrong = await login(req("/api/auth/login", "POST", { email: a.email, password: "not the password" }));
    const unknown = await login(req("/api/auth/login", "POST", { email: `ghost-${Date.now()}@example.test`, password: "not the password" }));
    expect([wrong.status, unknown.status]).toEqual([401, 401]);
    expect(((await wrong.json()) as { error: string }).error).toBe(((await unknown.json()) as { error: string }).error);
    expect(jar.size).toBe(0);
  });

  it("answers 429 with Retry-After once locked", async () => {
    const a = await makeAccount("login-lock");
    for (let i = 0; i < 5; i++) await login(req("/api/auth/login", "POST", { email: a.email, password: "wrong password!" }));
    const res = await login(req("/api/auth/login", "POST", { email: a.email, password: a.password }));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(jar.size).toBe(0); // locked out means locked out, even with the right password
  });
});

describe("POST /api/auth/logout", () => {
  it("revokes the login server-side, not just in the browser", async () => {
    const a = await makeAccount("logout");
    as(a);
    expect((await logout(req("/api/auth/logout", "POST"))).status).toBe(200);
    expect(jar.has(COOKIE)).toBe(false);
    // The old token is dead even if someone kept a copy of it.
    as(a);
    const probe = await changePasswordRoute(req("/api/auth/password", "PUT", { current: a.password, next: "another good passphrase" }));
    expect(probe.status).toBe(401);
  });
  it("is harmless when already signed out", async () => {
    expect((await logout(req("/api/auth/logout", "POST"))).status).toBe(200);
  });
});

describe("PUT /api/auth/password", () => {
  it("needs a login, the current password, and signs out the other devices", async () => {
    const a = await makeAccount("pw");
    expect((await changePasswordRoute(req("/api/auth/password", "PUT", { current: a.password, next: "x".repeat(12) }))).status).toBe(401);
    as(a);
    expect((await changePasswordRoute(req("/api/auth/password", "PUT", { current: "wrong", next: "x".repeat(12) }))).status).toBe(401);
    const other = await createLogin(a.consultantId);
    expect((await changePasswordRoute(req("/api/auth/password", "PUT", { current: a.password, next: "a better passphrase" }))).status).toBe(200);
    as({ token: other.token });
    expect((await changePasswordRoute(req("/api/auth/password", "PUT", { current: "a better passphrase", next: "yet another one here" }))).status).toBe(401);
  });
});

describe("cross-site requests", () => {
  it.each([
    ["Sec-Fetch-Site: cross-site", { "sec-fetch-site": "cross-site" }, true],
    ["an Origin on another host", { origin: "https://evil.example" }, true],
    ["a malformed Origin", { origin: "not a url" }, true],
    ["the same Origin", { origin: "http://app.test" }, false],
    ["no Origin (curl, tests)", {}, false],
    ["Sec-Fetch-Site: same-origin", { "sec-fetch-site": "same-origin" }, false],
  ])("a POST with %s -> refused=%s", (_n, headers, refused) => {
    expect(crossSite(req("/x", "POST", {}, headers))).toBe(refused);
  });
  it("never blocks a plain GET", () => {
    expect(crossSite(req("/x", "GET", undefined, { origin: "https://evil.example", "sec-fetch-site": "cross-site" }))).toBe(false);
  });
  it("a state-changing route refuses it before doing anything", async () => {
    const a = await makeAccount("csrf");
    as(a);
    const res = await changePasswordRoute(req("/api/auth/password", "PUT", { current: a.password, next: "a sneaky new passphrase" }, { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    expect((await prisma.consultant.findUniqueOrThrow({ where: { id: a.consultantId } })).passwordHash).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------------------------
// One consultant against another's records.
// ---------------------------------------------------------------------------------------------

describe("one consultant cannot reach another's data", () => {
  let alice: Awaited<ReturnType<typeof makeAccount>>;
  let bob: Awaited<ReturnType<typeof makeAccount>>;
  beforeAll(async () => {
    alice = await makeAccount("alice");
    bob = await makeAccount("bob");
  });

  /** Every handler keyed by a session id, called with Alice's session. */
  const handlers = async () => {
    const mod = async (p: string) => (await import(/* @vite-ignore */ p)) as Record<string, (r: Request, c: { params: Promise<Record<string, string>> }) => Promise<Response>>;
    return [
      ["PATCH session", (await mod("@/app/api/sessions/[id]/route")).PATCH!, "PATCH", { internalNotes: "pwned" }, { id: alice.sessionId }],
      ["POST status", (await mod("@/app/api/sessions/[id]/status/route")).POST!, "POST", { to: "COMPLETED" }, { id: alice.sessionId }],
      ["POST transcript", (await mod("@/app/api/sessions/[id]/transcript/route")).POST!, "POST", { mode: "demo" }, { id: alice.sessionId }],
      ["POST review", (await mod("@/app/api/sessions/[id]/review/route")).POST!, "POST", {}, { id: alice.sessionId }],
      ["GET share", (await mod("@/app/api/sessions/[id]/share/route")).GET!, "GET", undefined, { id: alice.sessionId }],
      ["POST questions", (await mod("@/app/api/sessions/[id]/questions/route")).POST!, "POST", { text: "A planted question" }, { id: alice.sessionId }],
      ["DELETE questions", (await mod("@/app/api/sessions/[id]/questions/route")).DELETE!, "DELETE", undefined, { id: alice.sessionId }],
      ["GET pdf", (await mod("@/app/api/sessions/[id]/pdf/route")).GET!, "GET", undefined, { id: alice.sessionId }],
      ["GET invite", (await mod("@/app/api/sessions/[id]/invite/route")).GET!, "GET", undefined, { id: alice.sessionId }],
      ["POST email", (await mod("@/app/api/sessions/[id]/email/route")).POST!, "POST", { attachPdf: false }, { id: alice.sessionId }],
      ["POST prototype", (await mod("@/app/api/sessions/[id]/prototype/route")).POST!, "POST", { op: "alert.remove", moduleId: "m", alertId: "a" }, { id: alice.sessionId }],
    ] as const;
  };

  it("Bob gets a plain 404 from every session route on Alice's session, and nothing changes", async () => {
    const before = await prisma.session.findUniqueOrThrow({ where: { id: alice.sessionId }, include: { _count: { select: { segments: true, questions: true } } } });
    as(bob);
    for (const [name, handler, method, body, params] of await handlers()) {
      const res = await handler(req(`/api/sessions/${alice.sessionId}`, method, body), ctx(params));
      expect(res.status, name).toBe(404);
      expect(((await res.json()) as { error: string }).error, name).toBe("Session not found."); // same words as a session that does not exist
    }
    const after = await prisma.session.findUniqueOrThrow({ where: { id: alice.sessionId }, include: { _count: { select: { segments: true, questions: true } } } });
    expect(after.internalNotes).toBe(before.internalNotes);
    expect(after.status).toBe(before.status);
    expect(after._count).toEqual(before._count);
  });

  it("the per-question routes are covered too", async () => {
    const q = await prisma.question.findFirstOrThrow({ where: { sessionId: alice.sessionId } });
    const { PATCH, DELETE } = (await import("@/app/api/sessions/[id]/questions/[questionId]/route")) as { PATCH: (r: Request, c: unknown) => Promise<Response>; DELETE: (r: Request, c: unknown) => Promise<Response> };
    as(bob);
    expect((await PATCH(req("/x", "PATCH", { notes: "pwned" }), ctx({ id: alice.sessionId, questionId: q.id }))).status).toBe(404);
    expect((await DELETE(req("/x", "DELETE"), ctx({ id: alice.sessionId, questionId: q.id }))).status).toBe(404);
    // Bob cannot reach it by pairing it with HIS OWN session id either.
    expect((await PATCH(req("/x", "PATCH", { notes: "pwned" }), ctx({ id: bob.sessionId, questionId: q.id }))).status).toBe(404);
    expect((await prisma.question.findUniqueOrThrow({ where: { id: q.id } })).notes).toBeNull();
  });

  it("an anonymous caller gets 401 from all of them", async () => {
    as(null);
    for (const [name, handler, method, body, params] of await handlers()) {
      expect((await handler(req("/x", method, body), ctx(params))).status, name).toBe(401);
    }
  });

  it("Alice, the owner, is served normally", async () => {
    as(alice);
    const { GET } = await import("@/app/api/sessions/[id]/share/route");
    expect((await GET(req("/x", "GET"), ctx({ id: alice.sessionId }))).status).toBe(404); // not built yet: a real, different 404
    const { PATCH } = await import("@/app/api/sessions/[id]/route");
    expect((await PATCH(req("/x", "PATCH", { internalNotes: "mine" }), ctx({ id: alice.sessionId }))).status).toBe(200);
    expect((await prisma.session.findUniqueOrThrow({ where: { id: alice.sessionId } })).internalNotes).toBe("mine");
  });

  it("clients: Bob cannot read, edit or probe Alice's client", async () => {
    as(bob);
    const { PUT } = await import("@/app/api/clients/[id]/route");
    const res = await PUT(req("/x", "PUT", { name: "Hijacked", companyName: "Hijacked Co" }), ctx({ id: alice.clientId }));
    expect(res.status).toBe(404);
    expect((await prisma.client.findUniqueOrThrow({ where: { id: alice.clientId } })).name).not.toBe("Hijacked");
    const { POST: brand } = await import("@/app/api/clients/[id]/brand/route");
    expect((await brand(req("/x", "POST"), ctx({ id: alice.clientId }))).status).toBe(404);
  });

  it("Bob cannot create a session on Alice's client", async () => {
    as(bob);
    const { POST } = await import("@/app/api/sessions/route");
    const res = await POST(req("/api/sessions", "POST", { clientId: alice.clientId, type: "DISCOVERY" }));
    expect(res.status).toBe(404);
    expect(await prisma.session.count({ where: { clientId: alice.clientId, consultantId: bob.consultantId } })).toBe(0);
  });

  it("settings only ever change the signed-in account", async () => {
    as(bob);
    const { PUT } = await import("@/app/api/consultant/route");
    const res = await PUT(req("/api/consultant", "PUT", { name: "Bob Renamed", email: bob.email, businessName: "Bob Co", primaryColor: "#112233", accentColor: "#445566" }));
    expect(res.status).toBe(200);
    expect((await prisma.consultant.findUniqueOrThrow({ where: { id: bob.consultantId } })).name).toBe("Bob Renamed");
    expect((await prisma.consultant.findUniqueOrThrow({ where: { id: alice.consultantId } })).name).not.toBe("Bob Renamed");
  });

  it("settings refuse an email that belongs to someone else", async () => {
    as(bob);
    const { PUT } = await import("@/app/api/consultant/route");
    const res = await PUT(req("/api/consultant", "PUT", { name: "Bob", email: alice.email, businessName: "Bob Co", primaryColor: "#112233", accentColor: "#445566" }));
    expect(res.status).toBe(409);
    expect((await prisma.consultant.findUniqueOrThrow({ where: { id: bob.consultantId } })).email).not.toBe(alice.email);
  });

  it("a session list never contains another consultant's sessions", async () => {
    const { listSessions } = await import("@/server/sessions");
    const mine = await listSessions(bob.consultantId);
    expect(mine.map((s) => s.id)).not.toContain(alice.sessionId);
    expect(mine.map((s) => s.id)).toContain(bob.sessionId);
  });
});

// ---------------------------------------------------------------------------------------------
// Completeness: nothing was forgotten. Every route file and page is either deliberately public or guarded.
// ---------------------------------------------------------------------------------------------

describe("nothing is left unguarded", () => {
  const root = path.resolve(__dirname, "..");
  const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  const rel = (f: string) => path.relative(path.join(root, "src/app"), f).split(path.sep).join("/");

  /** Deliberately reachable without a login. Adding to this list is a decision, and shows up in review. */
  const PUBLIC_ROUTES = new Set(["api/health/route.ts", "api/auth/signup/route.ts", "api/auth/login/route.ts", "api/auth/logout/route.ts"]);
  const PUBLIC_PAGES = new Set(["login/page.tsx", "signup/page.tsx", "reveal/[sessionId]/page.tsx", "prototype/[sessionId]/page.tsx", "health/page.tsx"]);

  const routes = import.meta.glob("../src/app/api/**/route.ts");

  it("finds the routes (so this check cannot pass by finding nothing)", () => {
    expect(Object.keys(routes).length).toBeGreaterThanOrEqual(15);
    expect(Object.keys(routes).length).toBe(walk(path.join(root, "src/app/api")).filter((f) => f.endsWith("route.ts")).length);
  });

  it("every non-public API handler answers an anonymous caller with 401", async () => {
    as(null);
    const checked: string[] = [];
    for (const [file, load] of Object.entries(routes)) {
      const name = file.replace("../src/app/", "");
      if (PUBLIC_ROUTES.has(name)) continue;
      const mod = (await load()) as Record<string, unknown>;
      const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"].filter((m) => typeof mod[m] === "function");
      expect(methods.length, `${name} exports no handler`).toBeGreaterThan(0);
      for (const m of methods) {
        const params = { id: "someone-elses-id", questionId: "q" };
        const res = await (mod[m] as (r: Request, c: unknown) => Promise<Response>)(req("/x", m, m === "GET" || m === "DELETE" ? undefined : {}), ctx(params));
        expect(res.status, `${m} ${name} answered an anonymous caller with ${res.status}`).toBe(401);
        checked.push(`${m} ${name}`);
      }
    }
    expect(checked.length).toBeGreaterThanOrEqual(15);
  });

  it("the public API routes are exactly the ones listed (the list cannot rot)", () => {
    const present = Object.keys(routes).map((f) => f.replace("../src/app/", ""));
    for (const p of PUBLIC_ROUTES) expect(present, `${p} is listed as public but does not exist`).toContain(p);
  });

  it("every page outside the public list requires a login", () => {
    const pages = walk(path.join(root, "src/app")).filter((f) => f.endsWith("page.tsx"));
    expect(pages.length).toBeGreaterThanOrEqual(10);
    for (const f of pages) {
      const name = rel(f);
      const src = fs.readFileSync(f, "utf8");
      if (PUBLIC_PAGES.has(name)) continue;
      expect(/requireConsultant\(/.test(src), `${name} does not call requireConsultant()`).toBe(true);
    }
  });

  it("the cockpit page also checks that the session is yours", () => {
    expect(fs.readFileSync(path.join(root, "src/app/cockpit/[sessionId]/page.tsx"), "utf8")).toMatch(/ownsSession\(/);
  });

  it("the client-facing pages stay public (they must never depend on a login)", () => {
    const reveal = fs.readFileSync(path.join(root, "src/app/reveal/[sessionId]/page.tsx"), "utf8");
    expect(/server\/auth|requireConsultant|currentConsultant|ownsSession/.test(reveal), "the reveal must not use auth").toBe(false);
    // The prototype may ask whether the viewer is the owner (to show edit controls) but must never require a login.
    const proto = fs.readFileSync(path.join(root, "src/app/prototype/[sessionId]/page.tsx"), "utf8");
    expect(/requireConsultant|redirect\(/.test(proto), "the prototype must not require a login").toBe(false);
    expect(proto).toMatch(/ownsSession\(/);
  });
});

// ---------------------------------------------------------------------------------------------
// The prototype: a public capability URL to read, owner-only to change.
// ---------------------------------------------------------------------------------------------

describe("prototype editing in accounts mode", () => {
  let owner: { consultantId: string; token: string; sessionId: string; moduleId: string };
  let stranger: { token: string };

  beforeAll(async () => {
    const { makeAssessmentSession } = await import("./helpers");
    const { buildClientReview } = await import("@/server/review");
    const s = await makeAssessmentSession("proto-access");
    await prisma.consultant.update({ where: { id: s.consultantId }, data: { passwordHash: await hashPassword("a prototype owner passphrase") } });
    await buildClientReview(s.id);
    const { token } = await createLogin(s.consultantId);
    const securityModule = await prisma.prototypeModule.findFirstOrThrow({ where: { sessionId: s.id, moduleType: "security" } });
    owner = { consultantId: s.consultantId, token, sessionId: s.id, moduleId: securityModule.id };
    stranger = await makeAccount("proto-stranger");
  });

  const page = async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { default: PrototypePage } = await import("@/app/prototype/[sessionId]/page");
    return renderToStaticMarkup(await PrototypePage({ params: Promise.resolve({ sessionId: owner.sessionId }), searchParams: Promise.resolve({}) }));
  };
  const edit = async (who: { token: string } | null, body: unknown) => {
    as(who);
    const { POST } = await import("@/app/api/sessions/[id]/prototype/route");
    return POST(req(`/api/sessions/${owner.sessionId}/prototype`, "POST", body), ctx({ id: owner.sessionId }));
  };
  const op = () => ({ op: "alert.add", moduleId: owner.moduleId, severity: "low", title: "Typed by whoever got in" });

  it("the owner gets the controls on the page", async () => {
    as(owner);
    const html = await page();
    for (const id of ["draft-approve", "finance-edit", "alert-add", "contact-add"]) expect(html, id).toContain(`data-testid="${id}"`);
  });

  it("a guest with the link reads the whole prototype and gets no controls", async () => {
    as(null);
    const html = await page();
    expect(html).toContain("PROTOTYPE");
    expect(html).toContain('data-testid="finance-line"');
    for (const id of ["draft-approve", "draft-edit", "draft-reject", "finance-edit", "alert-add", "alert-remove", "contact-add", "contact-remove"]) {
      expect(html, id).not.toContain(`data-testid="${id}"`);
    }
  });

  it("another signed-in consultant gets no controls either", async () => {
    const html = (as(stranger), await page());
    expect(html).toContain('data-testid="finance-line"');
    expect(html).not.toContain('data-testid="draft-approve"');
  });

  it("the edit endpoint: owner 200, stranger 404, guest 401, and only the owner's change lands", async () => {
    expect((await edit(stranger, op())).status).toBe(404);
    expect((await edit(null, op())).status).toBe(401);
    expect(await prisma.prototypeModule.findUniqueOrThrow({ where: { id: owner.moduleId } }).then((m) => JSON.stringify(m.data))).not.toContain("Typed by whoever got in");
    expect((await edit(owner, op())).status).toBe(200);
    expect(await prisma.prototypeModule.findUniqueOrThrow({ where: { id: owner.moduleId } }).then((m) => JSON.stringify(m.data))).toContain("Typed by whoever got in");
  });

  it("a cross-site edit is refused even with the owner's cookie", async () => {
    as(owner);
    const { POST } = await import("@/app/api/sessions/[id]/prototype/route");
    const res = await POST(req("/x", "POST", op(), { origin: "https://evil.example" }), ctx({ id: owner.sessionId }));
    expect(res.status).toBe(403);
  });
});
