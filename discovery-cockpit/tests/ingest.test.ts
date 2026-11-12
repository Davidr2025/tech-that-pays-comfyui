/** Live ingest: what a note-taker may post, who it is attributed to, and that the secret link can do nothing else. */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { POST as publicIngest } from "@/app/api/ingest/[token]/route";
import { GET as pollTranscript } from "@/app/api/sessions/[id]/transcript/route";
import { contiguousCount, mergeSegments } from "@/components/cockpit/cockpit";
import { prisma } from "@/lib/db";
import { isMe, parseIngest } from "@/lib/ingest";
import { signup } from "@/server/accounts";
import { stageDemoFor } from "@/server/demo";
import { disableIngest, enableIngest, ingest } from "@/server/ingest";
import { meetingUrlProblem, publicOrigin, recallConfigured, sendBot } from "@/server/recall";
import { makeDemoSession } from "./helpers";

const ME = ["Test Consultant", "Test"];
const recall = (name: string | null, text: string, extra: Record<string, unknown> = {}) => ({
  event: "transcript.data",
  data: { data: { words: text.split(" ").map((t) => ({ text: t })), participant: { id: 1, name, is_host: false, ...extra } }, bot: { id: "b1", metadata: {} } },
});
const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
const post = (token: string, body: unknown, query = "") =>
  publicIngest(new Request(`http://test.local/api/ingest/${token}${query}`, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }), ctx({ token }));

describe("parseIngest", () => {
  it("reads the simple shapes", () => {
    expect(parseIngest({ speaker: "client", text: "  We lose   leads. " }, ME)).toEqual({ ok: true, lines: [{ speaker: "CLIENT", text: "We lose leads." }] });
    expect(parseIngest({ lines: [{ speaker: "me", text: "Hi" }, { speaker: "Priya Nair", text: "Hello" }, { name: "Test Consultant", text: "Great" }] }, ME)).toEqual({
      ok: true,
      lines: [{ speaker: "CONSULTANT", text: "Hi" }, { speaker: "CLIENT", text: "Hello" }, { speaker: "CONSULTANT", text: "Great" }],
    });
  });
  it("reads a Recall transcript.data event and ignores partial ones", () => {
    expect(parseIngest(recall("Priya Nair", "It takes ten hours a week"), ME)).toEqual({ ok: true, lines: [{ speaker: "CLIENT", text: "It takes ten hours a week" }] });
    expect(parseIngest(recall("Test Consultant (Studio)", "What does that cost you"), ME)).toMatchObject({ lines: [{ speaker: "CONSULTANT" }] });
    expect(parseIngest(recall(null, "No name here", { is_host: true }), ME)).toMatchObject({ lines: [{ speaker: "CONSULTANT" }] });
    expect(parseIngest({ ...recall("Priya", "half a sen"), event: "transcript.partial_data" }, ME)).toEqual({ ok: true, lines: [], ignored: "transcript.partial_data" });
    expect(parseIngest(recall("Priya", ""), ME)).toEqual({ ok: true, lines: [] });
  });
  it("refuses what it cannot use", () => {
    expect(parseIngest("hello", ME).ok).toBe(false);
    expect(parseIngest({ speaker: "client" }, ME).ok).toBe(false);
    expect(parseIngest({ lines: Array.from({ length: 51 }, () => ({ text: "x" })) }, ME).ok).toBe(false);
  });
  it("matches your name, not a name that merely starts the same", () => {
    expect(isMe("David", ["David Rhodd"])).toBe(true);
    expect(isMe("David Rhodd - Limitless", ["David Rhodd"])).toBe(true);
    expect(isMe("Davidson Lee", ["David Rhodd", "David"])).toBe(false);
    expect(isMe("", ["David"])).toBe(false);
  });
});

describe("the secret link", () => {
  let sessionId: string;
  let token: string;
  beforeAll(async () => {
    sessionId = (await makeDemoSession("ingest")).id;
    await prisma.transcriptSegment.deleteMany({ where: { sessionId } });
    token = await enableIngest(sessionId);
  });

  it("stores only a hash of the token", async () => {
    const row = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(row.ingestTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain(token);
  });

  it("appends lines to that session, attributed by name, and the cockpit's poll returns them", async () => {
    expect((await post(token, { speaker: "consultant", text: "Where do the hours go?" })).status).toBe(200);
    const res = await post(token, recall("Priya Nair", "Reports take ten hours a week."));
    expect(await res.json()).toEqual({ ok: true, accepted: 1 });
    const rows = await prisma.transcriptSegment.findMany({ where: { sessionId }, orderBy: { order: "asc" } });
    expect(rows.map((r) => [r.order, r.speaker, r.text])).toEqual([[0, "CONSULTANT", "Where do the hours go?"], [1, "CLIENT", "Reports take ten hours a week."]]);
    expect((await prisma.session.findUniqueOrThrow({ where: { id: sessionId } })).status).toBe("LIVE");

    const poll = await pollTranscript(new Request(`http://test.local/x?after=1`), ctx({ id: sessionId }));
    expect(await poll.json()).toMatchObject({ total: 2, segments: [{ order: 1, speaker: "CLIENT" }] });
    expect((await pollTranscript(new Request(`http://test.local/x?after=-1`), ctx({ id: sessionId }))).status).toBe(400);
  });

  it("lets the link say who you are when your meeting name differs", async () => {
    await post(token, recall("Dave R", "Tell me more."), "?me=Dave%20R");
    expect((await prisma.transcriptSegment.findFirstOrThrow({ where: { sessionId }, orderBy: { order: "desc" } })).speaker).toBe("CONSULTANT");
  });

  it("gives every line its own position when many arrive at once", async () => {
    const before = await prisma.transcriptSegment.count({ where: { sessionId } });
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => ingest(token, { speaker: "client", text: `burst ${i}` }, null)));
    expect(results.every((r) => r.status === 200)).toBe(true);
    const orders = (await prisma.transcriptSegment.findMany({ where: { sessionId }, orderBy: { order: "asc" } })).map((r) => r.order);
    expect(orders).toEqual(Array.from({ length: before + 8 }, (_, i) => i));
  });

  it("answers a wrong, malformed or revoked token with the same 404, and never reveals anything", async () => {
    for (const bad of ["nope", "x".repeat(43), `${token}x`, "../../etc"]) {
      const res = await post(bad, { speaker: "client", text: "hi" });
      expect(res.status, bad).toBe(404);
      expect(await res.json()).toEqual({ error: "Not found." });
    }
    const other = await enableIngest(sessionId); // replacing the link kills the old one
    expect((await post(token, { speaker: "client", text: "old link" })).status).toBe(404);
    await disableIngest(sessionId);
    expect((await post(other, { speaker: "client", text: "revoked" })).status).toBe(404);
    token = await enableIngest(sessionId);
  });

  it("refuses junk and oversized bodies without storing anything", async () => {
    const before = await prisma.transcriptSegment.count({ where: { sessionId } });
    expect((await post(token, "not json")).status).toBe(400);
    expect((await post(token, { speaker: "client" })).status).toBe(400);
    expect((await post(token, { speaker: "client", text: "x".repeat(120_000) })).status).toBe(413);
    expect(await prisma.transcriptSegment.count({ where: { sessionId } })).toBe(before);
  });

  it("stops accepting lines once the session is complete", async () => {
    const done = await makeDemoSession("ingest-done");
    const t = await enableIngest(done.id);
    await prisma.session.update({ where: { id: done.id }, data: { status: "COMPLETED" } });
    expect((await post(t, { speaker: "client", text: "too late" })).status).toBe(409);
  });

  it("slows a flood down", async () => {
    const s = await makeDemoSession("ingest-flood");
    const t = await enableIngest(s.id);
    let last = 200;
    for (let i = 0; i < 6 && last === 200; i++) last = (await ingest(t, { lines: Array.from({ length: 50 }, () => ({ speaker: "client", text: "spam" })) }, null)).status;
    expect(last).toBe(429);
  });
});

describe("mergeSegments", () => {
  const seg = (order: number) => ({ order, speaker: "CLIENT" as const, text: `l${order}`, startSec: null });
  it("adds only new lines, in order, and keeps the same array when nothing is new", () => {
    const have = [seg(0), seg(1)];
    expect(mergeSegments(have, [seg(1)])).toBe(have);
    expect(mergeSegments(have, [seg(3), seg(1), seg(2)]).map((s) => s.order)).toEqual([0, 1, 2, 3]);
  });
  it("the poll resumes from the first gap, so a line numbered before a typed one is never skipped", () => {
    expect(contiguousCount([seg(0), seg(1), seg(2)])).toBe(3);
    expect(contiguousCount([seg(0), seg(1), seg(3)])).toBe(2); // line 2 is still on the server
    expect(contiguousCount([])).toBe(0);
    expect(mergeSegments([seg(0), seg(1), seg(3)], [seg(2), seg(3)]).map((s) => s.order)).toEqual([0, 1, 2, 3]);
  });
});

describe("the meeting bot (Recall.ai), against a local stand-in", () => {
  let server: http.Server;
  let url: string;
  const seen: { path: string; auth?: string; body: Record<string, unknown> }[] = [];
  let reply: { status: number; body: unknown } = { status: 201, body: { id: "0a1b2c3d-1111-2222-3333-444455556666" } };
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        seen.push({ path: req.url ?? "", auth: req.headers.authorization, body: JSON.parse(Buffer.concat(chunks).toString() || "{}") });
        res.writeHead(reply.status, { "content-type": "application/json" });
        res.end(JSON.stringify(reply.body));
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));
  const env = () => ({ RECALL_API_KEY: "stub-recall-key", RECALL_BASE_URL: url }) as unknown as NodeJS.ProcessEnv;

  it("is off without a key, and needs a public address", () => {
    expect(recallConfigured({} as NodeJS.ProcessEnv)).toBe(false);
    expect(publicOrigin({} as NodeJS.ProcessEnv)).toBeNull();
    expect(publicOrigin({ PUBLIC_URL: "http://insecure.example" } as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(publicOrigin({ VERCEL_PROJECT_PRODUCTION_URL: "cockpit.example.app" } as unknown as NodeJS.ProcessEnv)).toBe("https://cockpit.example.app");
  });

  it("only accepts real meeting links", () => {
    expect(meetingUrlProblem("https://us02web.zoom.us/j/123")).toBeNull();
    expect(meetingUrlProblem("https://meet.google.com/abc-defg-hij")).toBeNull();
    for (const bad of ["http://zoom.us/j/1", "https://evil.example/zoom.us", "https://zoom.us.evil.example/j/1", "javascript:alert(1)", "zoom"]) expect(meetingUrlProblem(bad), bad).not.toBeNull();
  });

  it("asks for a bot with real-time lines sent to the session's link", async () => {
    const id = await sendBot({ meetingUrl: "https://meet.google.com/abc-defg-hij", webhookUrl: "https://cockpit.example.app/api/ingest/tok", botName: "Avery's note-taker" }, env());
    expect(id).toBe("0a1b2c3d-1111-2222-3333-444455556666");
    expect(seen.at(-1)).toMatchObject({
      path: "/api/v1/bot/",
      auth: "Token stub-recall-key",
      body: {
        meeting_url: "https://meet.google.com/abc-defg-hij",
        bot_name: "Avery's note-taker",
        recording_config: { transcript: { provider: { recallai_streaming: {} } }, realtime_endpoints: [{ type: "webhook", url: "https://cockpit.example.app/api/ingest/tok", events: ["transcript.data"] }] },
      },
    });
  });

  it("never sends a request for a link that is not a meeting, and hides upstream details", async () => {
    const n = seen.length;
    await expect(sendBot({ meetingUrl: "https://evil.example/x", webhookUrl: "https://a/b", botName: "x" }, env())).rejects.toMatchObject({ code: "INVALID" });
    expect(seen.length).toBe(n);
    reply = { status: 401, body: { detail: "Invalid token stub-recall-key" } };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(sendBot({ meetingUrl: "https://zoom.us/j/1", webhookUrl: "https://a/b", botName: "x" }, env())).rejects.toMatchObject({ code: "UPSTREAM", message: "The note-taker service refused the request (401)." });
    expect(String(warn.mock.calls.flat().join(" "))).not.toContain("stub-recall-key");
    warn.mockRestore();
  });
});

describe("sign-up on a public server", () => {
  const input = (email: string, code?: string) => ({ name: "New Owner", businessName: "Owner Co", email, password: "correct horse battery staple", ...(code === undefined ? {} : { code }) });
  it("requires the code when the server sets one", async () => {
    const env = { SIGNUP_CODE: "open-sesame-42", ALLOW_SIGNUP: "true" };
    await expect(signup(input(`a-${Date.now()}@example.test`), env)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(signup(input(`b-${Date.now()}@example.test`, "wrong"), env)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const ok = await signup(input(`c-${Date.now()}@example.test`, " open-sesame-42 "), env);
    expect(ok.email).toContain("c-");
    // and no code is needed when none is set
    await expect(signup(input(`d-${Date.now()}@example.test`), { ALLOW_SIGNUP: "true" })).resolves.toBeTruthy();
  });

  it("stages the two demo calls for a new account, not started", async () => {
    const c = await signup(input(`demo-${Date.now()}@example.test`), { ALLOW_SIGNUP: "true" });
    await stageDemoFor(c.id);
    const sessions = await prisma.session.findMany({ where: { consultantId: c.id }, include: { _count: { select: { segments: true, questions: true } } } });
    expect(sessions.map((s) => [s.type, s.status, s._count.segments > 0, s._count.questions > 0]).sort()).toEqual([
      ["COMBINED_ASSESSMENT", "SETUP", true, true],
      ["DISCOVERY", "SETUP", true, true],
    ]);
  });
});
