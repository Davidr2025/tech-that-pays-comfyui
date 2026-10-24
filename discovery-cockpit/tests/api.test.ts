/** Route handlers, called directly with real Requests against the test database. */
import { beforeAll, describe, expect, it } from "vitest";
import { GET as health } from "@/app/api/health/route";
import { POST as createSession } from "@/app/api/sessions/route";
import { DELETE as resetQuestions } from "@/app/api/sessions/[id]/questions/route";
import { PATCH as patchQuestion } from "@/app/api/sessions/[id]/questions/[questionId]/route";
import { POST as buildReview } from "@/app/api/sessions/[id]/review/route";
import { POST as postTranscript } from "@/app/api/sessions/[id]/transcript/route";
import { prisma } from "@/lib/db";
import { makeDemoSession } from "./helpers";

const json = (body: unknown) => new Request("http://test.local/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

let id: string;
beforeAll(async () => {
  await prisma.consultant.count().then(async (n) => {
    if (n === 0) await makeDemoSession("api-bootstrap"); // createSession needs at least one consultant
  });
  id = (await makeDemoSession("api")).id;
});

describe("GET /api/health", () => {
  it("reports the database as up", async () => {
    const res = await health();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, database: "up" });
  });
});

describe("POST /api/sessions", () => {
  it("creates a blank session with the default question bank", async () => {
    const res = await createSession(json({ clientName: "Jamie", companyName: "Jamie's Bakery" }));
    expect(res.status).toBe(201);
    const { id: newId } = (await res.json()) as { id: string };
    expect(await prisma.question.count({ where: { sessionId: newId } })).toBe(12);
    expect(await prisma.transcriptSegment.count({ where: { sessionId: newId } })).toBe(0);
  });

  it("validates input", async () => {
    expect((await createSession(json({ clientName: "", companyName: "x" }))).status).toBe(400);
    expect((await createSession(json({}))).status).toBe(400);
    expect((await createSession(new Request("http://t/api", { method: "POST", body: "not json" }))).status).toBe(400);
  });
});

describe("POST /api/sessions/[id]/transcript", () => {
  it("loads the built-in demo call", async () => {
    const res = await postTranscript(json({ mode: "demo" }), ctx({ id }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { segments: unknown[] }).segments).toHaveLength(20);
  });

  it("parses a pasted transcript and replaces the old one", async () => {
    const res = await postTranscript(json({ mode: "paste", text: "Consultant: Hi.\nClient: Hello." }), ctx({ id }));
    expect(((await res.json()) as { segments: { speaker: string }[] }).segments.map((s) => s.speaker)).toEqual(["CONSULTANT", "CLIENT"]);
    expect(await prisma.transcriptSegment.count({ where: { sessionId: id } })).toBe(2);
  });

  it("rejects empty text, unknown modes and unknown sessions", async () => {
    expect((await postTranscript(json({ mode: "paste", text: "   " }), ctx({ id }))).status).toBe(400);
    expect((await postTranscript(json({ mode: "other" }), ctx({ id }))).status).toBe(400);
    expect((await postTranscript(json({ mode: "demo" }), ctx({ id: "missing" }))).status).toBe(404);
  });

  it("starts the new call with every question uncovered, manual ticks included", async () => {
    const q = await prisma.question.findFirstOrThrow({ where: { sessionId: id } });
    await patchQuestion(json({ covered: true }), ctx({ id, questionId: q.id }));
    await postTranscript(json({ mode: "demo" }), ctx({ id }));
    expect(await prisma.question.count({ where: { sessionId: id, isCovered: true } })).toBe(0);
  });
});

describe("question endpoints", () => {
  it("PATCH marks a manual check; DELETE clears everything", async () => {
    const [a, b] = await prisma.question.findMany({ where: { sessionId: id }, orderBy: { order: "asc" }, take: 2 });
    expect((await patchQuestion(json({ covered: true }), ctx({ id, questionId: a!.id }))).status).toBe(200);
    expect(await prisma.question.findUniqueOrThrow({ where: { id: a!.id } })).toMatchObject({ isCovered: true, coveredByAI: false });
    await prisma.question.update({ where: { id: b!.id }, data: { isCovered: true, coveredByAI: true } });

    expect((await resetQuestions(new Request("http://t", { method: "DELETE" }), ctx({ id }))).status).toBe(200);
    expect(await prisma.question.count({ where: { sessionId: id, OR: [{ isCovered: true }, { coveredByAI: true }] } })).toBe(0);
  });

  it("PATCH rejects bad bodies and questions from another session", async () => {
    const q = await prisma.question.findFirstOrThrow({ where: { sessionId: id } });
    expect((await patchQuestion(json({ covered: "yes" }), ctx({ id, questionId: q.id }))).status).toBe(400);
    expect((await patchQuestion(json({ covered: true }), ctx({ id: "someone-else", questionId: q.id }))).status).toBe(404);
  });
});

describe("POST /api/sessions/[id]/review", () => {
  it("builds the report and returns the reveal path", async () => {
    const res = await buildReview(json({}), ctx({ id }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ revealPath: `/reveal/${id}` });
    expect(await prisma.report.count({ where: { sessionId: id } })).toBe(1);
  });

  it("honours upTo, and refuses an empty transcript or unknown session", async () => {
    expect((await buildReview(json({ upTo: 4 }), ctx({ id }))).status).toBe(200);
    const empty = await makeDemoSession("api-empty");
    await prisma.transcriptSegment.deleteMany({ where: { sessionId: empty.id } });
    expect((await buildReview(json({}), ctx({ id: empty.id }))).status).toBe(400);
    expect((await buildReview(json({}), ctx({ id: "missing" }))).status).toBe(404);
    expect((await buildReview(json({ upTo: -3 }), ctx({ id }))).status).toBe(400);
  });
});
