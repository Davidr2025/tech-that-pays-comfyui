/**
 * Sending email for real: a real SMTP server on localhost receives the message, and mailparser reads
 * back exactly what a mail client would see. Also PDFs and invites over the routes.
 */
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { simpleParser, type ParsedMail } from "mailparser";
import { SMTPServer } from "smtp-server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as inviteRoute } from "@/app/api/sessions/[id]/invite/route";
import { POST as emailRoute } from "@/app/api/sessions/[id]/email/route";
import { GET as pdfRoute } from "@/app/api/sessions/[id]/pdf/route";
import { prisma } from "@/lib/db";
import { emailMode, smtpConfig, transportOptions } from "@/server/email-smtp";
import { lastSent, OutgoingError, pdfLimiter, sendLimiter, sendReviewEmail } from "@/server/outgoing";
import { buildClientReview } from "@/server/review";
import { findLeaks, FORBIDDEN_TEXT, makeDemoSession } from "./helpers";

const CHROME = process.env.PDF_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";
const haveChrome = fs.existsSync(CHROME);

interface Captured {
  mail: ParsedMail;
  rcpt: string[];
  from: string | false;
  authUser: string | null;
}
const captured: Captured[] = [];
let smtp: SMTPServer;
let smtpPort: number;
let rejectAuth = false;
let app: http.Server;
let appBase: string;

const code = async (p: Promise<unknown>) => ((await p.then(() => null, (e) => e)) as OutgoingError | null)?.code ?? null;

beforeAll(async () => {
  smtp = new SMTPServer({
    authOptional: true,
    allowInsecureAuth: true,
    disabledCommands: ["STARTTLS"],
    logger: false,
    onAuth(auth, _s, cb) {
      if (rejectAuth) return cb(new Error("Invalid login"));
      cb(null, { user: auth.username });
    },
    onData(stream, session, cb) {
      simpleParser(stream)
        .then((mail) => {
          captured.push({ mail, rcpt: session.envelope.rcptTo.map((r) => r.address), from: session.envelope.mailFrom && session.envelope.mailFrom.address, authUser: (session.user as string | undefined) ?? null });
          cb();
        })
        .catch(cb);
    },
  });
  await new Promise<void>((resolve) => smtp.listen(0, "127.0.0.1", resolve));
  smtpPort = (smtp.server.address() as AddressInfo).port;

  app = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`<!doctype html><h1>Client review</h1><p>${req.url}</p>`);
  });
  await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", resolve));
  appBase = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise((r) => smtp.close(() => r(null)));
  app.close();
});

const configure = (extra: Record<string, string> = {}) => {
  vi.stubEnv("SMTP_HOST", "127.0.0.1");
  vi.stubEnv("SMTP_PORT", String(smtpPort));
  vi.stubEnv("SMTP_FROM", "Reviews <reviews@studio.example>");
  vi.stubEnv("INTERNAL_URL", appBase);
  vi.stubEnv("PDF_CHROMIUM_PATH", CHROME);
  for (const [k, v] of Object.entries(extra)) vi.stubEnv(k, v);
};
beforeEach(() => {
  captured.length = 0;
  rejectAuth = false;
  configure();
});
afterEach(() => vi.unstubAllEnvs());

/** A built review with a client who has an email address. */
async function session(label: string, email: string | null = "pat@acme.example") {
  const s = await makeDemoSession(label);
  await prisma.client.update({ where: { id: s.clientId }, data: { email } });
  await prisma.consultant.update({ where: { id: s.consultantId }, data: { name: "Avery Quinn", email: `avery-${s.id}@quinn-ops.example` } });
  await buildClientReview(s.id);
  sendLimiter.clear(s.consultantId);
  pdfLimiter.clear(s.consultantId);
  return { ...s, consultantEmail: `avery-${s.id}@quinn-ops.example` };
}
const future = (days = 3) => new Date(Date.now() + days * 86_400_000).toISOString();

describe("configuration", () => {
  const cfg = (env: Record<string, string>) => smtpConfig(env);
  it("needs a host and a valid from address; otherwise the app uses mailto drafts", () => {
    expect(cfg({})).toBeNull();
    expect(cfg({ SMTP_HOST: "mail.example" })).toBeNull();
    expect(cfg({ SMTP_FROM: "a@b.co" })).toBeNull();
    expect(cfg({ SMTP_HOST: "mail.example", SMTP_FROM: "a@b.co" })).toMatchObject({ host: "mail.example", port: 587, secure: false, fromAddress: "a@b.co", user: null });
    expect(emailMode({})).toBe("mailto");
    expect(emailMode({ SMTP_HOST: "mail.example", SMTP_FROM: "a@b.co" })).toBe("smtp");
  });
  it.each([
    ["a display name", "Reviews <reviews@studio.example>", "reviews@studio.example"],
    ["a bare address", "reviews@studio.example", "reviews@studio.example"],
  ])("accepts %s as the sender", (_n, from, expected) => {
    expect(cfg({ SMTP_HOST: "h", SMTP_FROM: from })!.fromAddress).toBe(expected);
  });
  it.each([
    ["a header-injection attempt", "a@b.co\r\nBcc: evil@x.test"],
    ["two addresses", "a@b.co, c@d.co"],
    ["no address", "Reviews"],
    ["an empty value", ""],
  ])("rejects %s as the sender", (_n, from) => {
    expect(cfg({ SMTP_HOST: "h", SMTP_FROM: from })).toBeNull();
  });
  it.each([["0"], ["70000"], ["abc"], ["25.5"]])("rejects the port %s", (port) => {
    expect(cfg({ SMTP_HOST: "h", SMTP_FROM: "a@b.co", SMTP_PORT: port })).toBeNull();
  });
  it("treats port 465 and SMTP_SECURE as implicit TLS", () => {
    expect(cfg({ SMTP_HOST: "h", SMTP_FROM: "a@b.co", SMTP_PORT: "465" })!.secure).toBe(true);
    expect(cfg({ SMTP_HOST: "h", SMTP_FROM: "a@b.co", SMTP_PORT: "2525", SMTP_SECURE: "TRUE" })!.secure).toBe(true);
    expect(cfg({ SMTP_HOST: "h", SMTP_FROM: "a@b.co", SMTP_PORT: "2525" })!.secure).toBe(false);
  });
  it("refuses half a login rather than quietly sending without one", () => {
    expect(cfg({ SMTP_HOST: "h", SMTP_FROM: "a@b.co", SMTP_USER: "u" })).toBeNull();
    expect(cfg({ SMTP_HOST: "h", SMTP_FROM: "a@b.co", SMTP_PASS: "p" })).toBeNull();
    expect(cfg({ SMTP_HOST: "h", SMTP_FROM: "a@b.co", SMTP_USER: "u", SMTP_PASS: "p" })).toMatchObject({ user: "u", pass: "p" });
  });
  it("requires STARTTLS for any host that is not this machine", () => {
    const base = { port: 587, secure: false, user: "u", pass: "p", fromAddress: "a@b.co" };
    expect(transportOptions({ ...base, host: "smtp.provider.example" }).requireTLS).toBe(true);
    expect(transportOptions({ ...base, host: "127.0.0.1" }).requireTLS).toBe(false);
    expect(transportOptions({ ...base, host: "localhost" }).requireTLS).toBe(false);
    expect(transportOptions({ ...base, host: "smtp.provider.example", secure: true, port: 465 }).requireTLS).toBe(false); // already encrypted
    expect(transportOptions({ ...base, host: "smtp.provider.example" }).tls.rejectUnauthorized).toBe(true);
    expect(transportOptions({ ...base, host: "h", user: null, pass: null })).not.toHaveProperty("auth");
  });
});

describe("sending the review", () => {
  it("goes to the client's address only, from the server's address, with the consultant as Reply-To", async () => {
    const s = await session("send");
    const result = await sendReviewEmail(s.id, { attachPdf: false });
    expect(result.to).toBe("pat@acme.example");
    expect(captured).toHaveLength(1);
    const { mail, rcpt, from } = captured[0]!;
    expect(rcpt).toEqual(["pat@acme.example"]); // exactly one recipient on the wire
    expect(from).toBe("reviews@studio.example");
    expect(mail.from?.value[0]).toMatchObject({ name: "Avery Quinn", address: "reviews@studio.example" });
    expect(mail.replyTo?.value[0]?.address).toBe(s.consultantEmail);
    expect(mail.to).toMatchObject({ value: [{ address: "pat@acme.example" }] });
    expect(mail.cc).toBeUndefined();
    expect(mail.bcc).toBeUndefined();
    expect(mail.subject).toBe("Discovery Review for Acme Heating");
    expect(mail.text).toContain("Hi Pat,");
    expect(mail.text).toMatch(/Avery Quinn\nTest Studio\s*$/);
    expect(mail.attachments).toHaveLength(0);
  });

  it("contains nothing private", async () => {
    const s = await session("send-private");
    await prisma.session.update({ where: { id: s.id }, data: { internalNotes: "SENTINEL-MAIL-NOTE-3c90" } });
    await sendReviewEmail(s.id, { attachPdf: false });
    const raw = JSON.stringify(captured[0]!.mail.text);
    expect(findLeaks(raw, ["SENTINEL-MAIL-NOTE-3c90"])).toEqual([]);
    expect(findLeaks(raw, FORBIDDEN_TEXT)).toEqual([]);
  });

  it("is logged, so the consultant can see it was sent", async () => {
    const s = await session("send-log");
    expect(await lastSent(s.id)).toBeNull();
    await sendReviewEmail(s.id, { attachPdf: false });
    expect(await lastSent(s.id)).toMatchObject({ to: "pat@acme.example" });
    expect(await prisma.emailSend.findMany({ where: { sessionId: s.id } })).toMatchObject([{ withPdf: false, withInvite: false, subject: "Discovery Review for Acme Heating" }]);
  });

  it.skipIf(!haveChrome)("attaches the PDF when asked", async () => {
    const s = await session("send-pdf");
    await sendReviewEmail(s.id, { attachPdf: true });
    const att = captured[0]!.mail.attachments;
    expect(att).toHaveLength(1);
    expect(att[0]).toMatchObject({ contentType: "application/pdf", filename: "Acme-Heating-review.pdf" });
    expect(att[0]!.content.subarray(0, 5).toString()).toBe("%PDF-");
    expect(await prisma.emailSend.findFirst({ where: { sessionId: s.id } })).toMatchObject({ withPdf: true });
  }, 60_000);

  it("attaches a calendar invitation for the client when a time is proposed", async () => {
    const s = await session("send-invite");
    await sendReviewEmail(s.id, { attachPdf: false, invite: { start: future(), minutes: 45 } });
    const parts = captured[0]!.mail.attachments;
    // Nodemailer sends it twice: inline (text/calendar, which is what makes Gmail and Outlook show Accept/Decline) and as invite.ics.
    expect(parts.map((a) => a.contentType).sort()).toEqual(["application/ics", "text/calendar"]);
    expect(parts.find((a) => a.contentType === "application/ics")!.filename).toBe("invite.ics");
    const inline = parts.find((a) => a.contentType === "text/calendar")!;
    // Unfold first: calendar lines over 75 octets are folded onto continuation lines, as a calendar app would read them.
    const raw = inline.content.toString().replace(/\r\n[ \t]/g, "");
    expect(raw).toContain("METHOD:REQUEST");
    expect(raw).toMatch(/ATTENDEE;CN="Pat Client";[^\r\n]*:mailto:pat@acme\.example/);
    expect(raw).toMatch(/ORGANIZER;CN="Avery Quinn":mailto:avery-/);
    expect(raw).toContain("SUMMARY:Follow-up: Acme Heating");
    expect(await prisma.emailSend.findFirst({ where: { sessionId: s.id } })).toMatchObject({ withInvite: true });
  });

  it("a hostile company name cannot add headers or recipients", async () => {
    const s = await session("send-inject");
    await prisma.client.update({ where: { id: s.clientId }, data: { companyName: "Acme\r\nBcc: evil@x.test\r\nSubject: pwned" } });
    await buildClientReview(s.id).catch(() => undefined); // rebuild may be refused (status), the stored review is still fine
    await sendReviewEmail(s.id, { attachPdf: false });
    const { mail, rcpt } = captured[0]!;
    expect(rcpt).toEqual(["pat@acme.example"]);
    expect(mail.bcc).toBeUndefined();
    const lines = mail.headerLines.map((l) => l.key);
    expect(lines.filter((k) => k === "bcc")).toHaveLength(0); // no injected header
    expect(lines.filter((k) => k === "subject")).toHaveLength(1); // and the real one is not duplicated
    expect(mail.subject).not.toMatch(/[\r\n]/);
  });
});

describe("what it refuses to do", () => {
  it("does nothing when SMTP is not configured (the app uses mailto drafts)", async () => {
    const s = await session("refuse-nosmtp");
    vi.stubEnv("SMTP_HOST", "");
    expect(await code(sendReviewEmail(s.id, { attachPdf: false }))).toBe("CONFLICT");
    expect(captured).toHaveLength(0);
  });

  it.each([
    ["a client with no email", null, "CONFLICT"],
    ["a client email that is not valid", "pat@acme.example, evil@x.test", "CONFLICT"],
    ["an address with a newline", "pat@acme.example\r\nBcc: evil@x.test", "CONFLICT"],
  ])("refuses %s and sends nothing", async (_n, email, expected) => {
    const s = await session("refuse-email", null);
    await prisma.client.update({ where: { id: s.clientId }, data: { email } });
    expect(await code(sendReviewEmail(s.id, { attachPdf: false }))).toBe(expected);
    expect(captured).toHaveLength(0);
    expect(await prisma.emailSend.count({ where: { sessionId: s.id } })).toBe(0);
  });

  it("refuses before a review exists, and when the stored review fails its safety check", async () => {
    const fresh = await makeDemoSession("refuse-noreview");
    await prisma.client.update({ where: { id: fresh.clientId }, data: { email: "pat@acme.example" } });
    expect(await code(sendReviewEmail(fresh.id, { attachPdf: false }))).toBe("NOT_FOUND");
    expect(await code(sendReviewEmail("no-such-session", { attachPdf: false }))).toBe("NOT_FOUND");

    const bad = await session("refuse-tampered");
    const row = await prisma.report.findUniqueOrThrow({ where: { sessionId: bad.id } });
    await prisma.report.update({ where: { sessionId: bad.id }, data: { revealData: { ...(row.revealData as object), coaching: "leak" } } });
    expect(await code(sendReviewEmail(bad.id, { attachPdf: false }))).toBe("CONFLICT");
    expect(captured).toHaveLength(0);
  });

  it.each([
    ["in the past", () => new Date(Date.now() - 3600_000).toISOString(), 30],
    ["more than two years away", () => new Date(Date.now() + 3 * 365 * 86_400_000).toISOString(), 30],
    ["not a date", () => "next tuesday", 30],
    ["too short", future, 1],
    ["too long", future, 9999],
  ])("refuses an invite that is %s, sends nothing, and does not use up the hourly allowance", async (_n, start, minutes) => {
    const s = await session("refuse-invite");
    expect(await code(sendReviewEmail(s.id, { attachPdf: false, invite: { start: start(), minutes } }))).toBe("INVALID");
    expect(captured).toHaveLength(0);
    // The refused attempt must have cost nothing: all ten allowed sends still go through, and only the eleventh is held back.
    for (let i = 0; i < 10; i++) await sendReviewEmail(s.id, { attachPdf: false });
    expect(captured).toHaveLength(10);
    expect(await code(sendReviewEmail(s.id, { attachPdf: false }))).toBe("LOCKED");
  });

  it("sends nothing when the PDF was asked for but cannot be made", async () => {
    const s = await session("refuse-pdf");
    vi.stubEnv("PDF_CHROMIUM_PATH", "/nonexistent/chrome");
    expect(await code(sendReviewEmail(s.id, { attachPdf: true }))).toBe("CONFLICT");
    expect(captured).toHaveLength(0);
    expect(await prisma.emailSend.count({ where: { sessionId: s.id } })).toBe(0);
  });
});

describe("when the mail server misbehaves", () => {
  it("reports a plain failure, logs nothing as sent, and leaks no host, login or password", async () => {
    const s = await session("smtp-down");
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("SMTP_PORT", "1"); // nothing is listening there
    vi.stubEnv("SMTP_USER", "mailer-login-name");
    vi.stubEnv("SMTP_PASS", "SECRET-PASSWORD-9f2c");
    const err = (await sendReviewEmail(s.id, { attachPdf: false }).catch((e) => e)) as OutgoingError;
    expect(err.code).toBe("UPSTREAM");
    expect(err.message).toBe("The mail server did not accept the message.");
    for (const secret of ["SECRET-PASSWORD-9f2c", "mailer-login-name", "127.0.0.1", "ECONNREFUSED"]) expect(err.message).not.toContain(secret);
    expect(spy).toHaveBeenCalled(); // the operator still gets the real reason in the server log
    expect(await prisma.emailSend.count({ where: { sessionId: s.id } })).toBe(0);
    spy.mockRestore();
  });

  it("a rejected login is the same plain failure", async () => {
    const s = await session("smtp-auth");
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    rejectAuth = true;
    configure({ SMTP_USER: "mailer-login-name", SMTP_PASS: "SECRET-PASSWORD-9f2c" });
    const err = (await sendReviewEmail(s.id, { attachPdf: false }).catch((e) => e)) as OutgoingError;
    expect(err.message).toBe("The mail server did not accept the message.");
    expect(err.message).not.toMatch(/SECRET|mailer-login/);
    spy.mockRestore();
  });

  it("logs in when the server wants a login", async () => {
    const s = await session("smtp-login");
    configure({ SMTP_USER: "mailer", SMTP_PASS: "pw" });
    await sendReviewEmail(s.id, { attachPdf: false });
    expect(captured[0]!.authUser).toBe("mailer");
  });
});

describe("the hourly allowance", () => {
  it("is 10 emails per consultant, with a wait time after that, and one consultant never uses another's", async () => {
    const a = await session("limit-a");
    const b = await session("limit-b");
    for (let i = 0; i < 10; i++) await sendReviewEmail(a.id, { attachPdf: false });
    const err = (await sendReviewEmail(a.id, { attachPdf: false }).catch((e) => e)) as OutgoingError;
    expect(err.code).toBe("LOCKED");
    expect(err.retryAfter).toBeGreaterThan(0);
    expect(err.message).toMatch(/hourly limit/);
    expect(captured).toHaveLength(10);
    await expect(sendReviewEmail(b.id, { attachPdf: false })).resolves.toBeTruthy();
  });
});

describe("routes", () => {
  const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
  const post = (id: string, body: unknown) => emailRoute(new Request("http://t/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), ctx({ id }));
  const get = (route: typeof pdfRoute, id: string, qs = "") => route(new Request(`http://t/api?${qs}`), ctx({ id }));

  it("POST email sends, and answers with who it went to", async () => {
    const s = await session("route-email");
    const res = await post(s.id, { attachPdf: false });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sent: true, to: "pat@acme.example" });
    expect(captured).toHaveLength(1);
  });

  it.each([
    ["a recipient", { attachPdf: false, to: "evil@x.test" }],
    ["a subject", { subject: "Hello" }],
    ["body text", { text: "Pay me" }],
    ["a cc", { cc: "evil@x.test" }],
    ["an invite with an extra field", { invite: { start: future(), minutes: 30, attendee: "evil@x.test" } }],
    ["a wrong type", { attachPdf: "yes" }],
  ])("refuses a request that supplies %s: the app writes the email and chooses the recipient", async (_n, body) => {
    const s = await session("route-strict");
    expect((await post(s.id, body)).status).toBe(400);
    expect(captured).toHaveLength(0);
  });

  it("maps the failures to honest statuses", async () => {
    const s = await session("route-status");
    expect((await post("nope", {})).status).toBe(404);
    vi.stubEnv("SMTP_HOST", "");
    const res = await post(s.id, {});
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toMatch(/draft link/);
    vi.stubEnv("SMTP_HOST", "127.0.0.1");
    vi.stubEnv("SMTP_PORT", "1");
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await post(s.id, {})).status).toBe(502);
    spy.mockRestore();
  });

  it("GET invite returns a calendar file for the client", async () => {
    const s = await session("route-invite");
    const res = await get(inviteRoute, s.id, `start=${encodeURIComponent(future())}&minutes=30`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/^text\/calendar/);
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="invite.ics"');
    const ics = await res.text();
    expect(ics).toContain("METHOD:REQUEST");
    expect(ics).toMatch(/mailto:pat@acme\.example/);
  });
  it.each([
    ["no parameters", ""],
    ["a past time", `start=${encodeURIComponent(new Date(Date.now() - 3600_000).toISOString())}&minutes=30`],
    ["minutes out of range", `start=${encodeURIComponent(future())}&minutes=2`],
  ])("GET invite refuses %s", async (_n, qs) => {
    const s = await session("route-invite-bad");
    expect((await get(inviteRoute, s.id, qs)).status).toBe(400);
  });
  it("GET invite needs a client email", async () => {
    const s = await session("route-invite-noemail", null);
    expect((await get(inviteRoute, s.id, `start=${encodeURIComponent(future())}&minutes=30`)).status).toBe(409);
  });

  it("GET pdf 404s before a review exists and for a prototype that does not exist", async () => {
    const fresh = await makeDemoSession("route-pdf-none");
    expect((await get(pdfRoute, fresh.id, "doc=review")).status).toBe(404);
    const s = await session("route-pdf-noproto");
    expect((await get(pdfRoute, s.id, "doc=prototype")).status).toBe(404); // a discovery session has no prototype
    expect((await get(pdfRoute, s.id, "doc=contract")).status).toBe(400);
  });

  it.skipIf(!haveChrome)("GET pdf downloads a real PDF named after the client", async () => {
    const s = await session("route-pdf");
    const res = await get(pdfRoute, s.id, "doc=review");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="Acme-Heating-review.pdf"');
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(Buffer.from(await res.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
  }, 60_000);

  it("GET pdf says plainly when Chromium is not set up", async () => {
    const s = await session("route-pdf-nochrome");
    vi.stubEnv("PDF_CHROMIUM_PATH", "/nonexistent/chrome");
    const res = await get(pdfRoute, s.id, "doc=review");
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toMatch(/PDF_CHROMIUM_PATH/);
  });

  it("GET pdf is limited to 20 an hour per consultant", async () => {
    const s = await session("route-pdf-limit");
    vi.stubEnv("PDF_CHROMIUM_PATH", "/nonexistent/chrome"); // each attempt still counts, and fails fast
    for (let i = 0; i < 20; i++) expect((await get(pdfRoute, s.id, "doc=review")).status).toBe(409);
    const res = await get(pdfRoute, s.id, "doc=review");
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
  });
});
