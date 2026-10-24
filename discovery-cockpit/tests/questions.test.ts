/** Checklist management: private notes, wording, adding and deleting questions. Real routes, real (test) database. */
import { describe, expect, it } from "vitest";
import { POST as addQuestionRoute, DELETE as resetRoute } from "@/app/api/sessions/[id]/questions/route";
import { DELETE as deleteQuestionRoute, PATCH as patchQuestionRoute } from "@/app/api/sessions/[id]/questions/[questionId]/route";
import { POST as statusRoute } from "@/app/api/sessions/[id]/status/route";
import { prisma } from "@/lib/db";
import { buildClientReview } from "@/server/review";
import { getCockpitData } from "@/server/sessions";
import { getRevealPayload } from "@/server/reveal";
import { makeDemoSession } from "./helpers";

const send = (method: string, body?: unknown) =>
  new Request("http://test.local/api", { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
const first = (sessionId: string, topic?: string) => prisma.question.findFirstOrThrow({ where: { sessionId, ...(topic ? { topic } : {}) }, orderBy: { order: "asc" } });
const patch = (id: string, questionId: string, body: unknown) => patchQuestionRoute(send("PATCH", body), ctx({ id, questionId }));
const add = (id: string, text: unknown) => addQuestionRoute(send("POST", { text }), ctx({ id }));
const error = async (res: Response) => ((await res.json()) as { error: string }).error;

describe("private notes", () => {
  it("saves, trims, and clears a note", async () => {
    const { id } = await makeDemoSession("notes");
    const q = await first(id);
    const res = await patch(id, q.id, { notes: "  Ask about the Q3 retainer.  " });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { question: { notes: string } }).question.notes).toBe("Ask about the Q3 retainer.");
    expect((await first(id)).notes).toBe("Ask about the Q3 retainer.");
    await patch(id, q.id, { notes: "   " });
    expect((await first(id)).notes).toBeNull();
  });

  it("refuses an oversized note", async () => {
    const { id } = await makeDemoSession("notes-big");
    const res = await patch(id, (await first(id)).id, { notes: "x".repeat(2001) });
    expect(res.status).toBe(400);
    expect(await error(res)).toMatch(/under 2000/);
  });

  it("is available to the cockpit, and never touches coverage", async () => {
    const { id } = await makeDemoSession("notes-cockpit");
    const q = await first(id);
    await patch(id, q.id, { notes: "note" });
    const view = (await getCockpitData(id))!.questions.find((x) => x.id === q.id)!;
    expect(view).toMatchObject({ notes: "note", custom: false, manuallyCovered: false });
  });
});

describe("rewording", () => {
  it("changes the text and keeps the topic, so AI detection still works", async () => {
    const s = await makeDemoSession("reword");
    const q = await first(s.id, "time_sinks");
    const res = await patch(s.id, q.id, { text: "  Where does   the week actually go?  " });
    expect(res.status).toBe(200);
    expect(await first(s.id, "time_sinks")).toMatchObject({ text: "Where does the week actually go?", topic: "time_sinks" });
    await buildClientReview(s.id);
    expect((await first(s.id, "time_sinks")).isCovered).toBe(true); // detected from the call, by topic
  });

  it.each([
    ["too short", "ab", /few words/],
    ["only spaces", "     ", /few words/],
    ["too long", "x".repeat(301), /under 300/],
  ])("refuses wording that is %s", async (_n, text, message) => {
    const { id } = await makeDemoSession("reword-bad");
    const res = await patch(id, (await first(id)).id, { text });
    expect(res.status).toBe(400);
    expect(await error(res)).toMatch(message);
  });
});

describe("adding and deleting", () => {
  it("adds a question of your own at the end, tickable by hand only", async () => {
    const s = await makeDemoSession("add");
    const before = await prisma.question.count({ where: { sessionId: s.id } });
    const res = await add(s.id, "  What did the last agency get wrong?  ");
    expect(res.status).toBe(201);
    const { question } = (await res.json()) as { question: { id: string; topic: string; text: string; custom: boolean } };
    expect(question).toMatchObject({ text: "What did the last agency get wrong?", custom: true });
    expect(question.topic).toMatch(/^custom_[0-9a-f]{8}$/);
    const rows = await prisma.question.findMany({ where: { sessionId: s.id }, orderBy: { order: "asc" } });
    expect(rows).toHaveLength(before + 1);
    expect(rows.at(-1)!.id).toBe(question.id);
    expect(new Set(rows.map((r) => r.order)).size).toBe(rows.length); // orders stay unique

    await patch(s.id, question.id, { covered: true });
    await buildClientReview(s.id);
    expect(await prisma.question.findUniqueOrThrow({ where: { id: question.id } })).toMatchObject({ isCovered: true, coveredByAI: false }); // manual tick survives the review
  });

  it("two added questions never collide on topic or order", async () => {
    const s = await makeDemoSession("add-two");
    await add(s.id, "First custom question");
    await add(s.id, "Second custom question");
    const custom = await prisma.question.findMany({ where: { sessionId: s.id, topic: { startsWith: "custom_" } } });
    expect(custom).toHaveLength(2);
    expect(new Set(custom.map((c) => c.topic)).size).toBe(2);
  });

  it("deletes a question; the review neither recreates it nor fails", async () => {
    const s = await makeDemoSession("delete");
    const q = await first(s.id, "close_rate");
    expect((await deleteQuestionRoute(send("DELETE"), ctx({ id: s.id, questionId: q.id }))).status).toBe(200);
    expect(await prisma.question.count({ where: { sessionId: s.id, topic: "close_rate" } })).toBe(0);
    await buildClientReview(s.id);
    expect(await prisma.question.count({ where: { sessionId: s.id, topic: "close_rate" } })).toBe(0);
    expect((await getRevealPayload(s.id))?.header.clientCompany).toBe("Acme Heating");
  });

  it("a restart clears coverage but keeps your changes", async () => {
    const s = await makeDemoSession("restart");
    const q = await first(s.id);
    await patch(s.id, q.id, { text: "My own wording here", notes: "keep me", covered: true });
    await resetRoute(send("DELETE"), ctx({ id: s.id }));
    expect(await first(s.id)).toMatchObject({ text: "My own wording here", notes: "keep me", isCovered: false });
  });

  it("refuses to touch another session's question, and unknown ids", async () => {
    const a = await makeDemoSession("owner-a");
    const b = await makeDemoSession("owner-b");
    const q = await first(a.id);
    expect((await patch(b.id, q.id, { notes: "hijack" })).status).toBe(404);
    expect((await deleteQuestionRoute(send("DELETE"), ctx({ id: b.id, questionId: q.id }))).status).toBe(404);
    expect((await first(a.id)).notes).toBeNull();
    expect((await add("no-such-session", "A real question")).status).toBe(404);
    expect((await deleteQuestionRoute(send("DELETE"), ctx({ id: a.id, questionId: "nope" }))).status).toBe(404);
  });
});

describe("request validation", () => {
  it.each([
    ["an empty body", {}],
    ["an unknown field", { covered: true, topic: "evil" }],
    ["a wrong type", { notes: 5 }],
  ])("PATCH rejects %s", async (_n, body) => {
    const { id } = await makeDemoSession("bad-body");
    expect((await patch(id, (await first(id)).id, body)).status).toBe(400);
  });
  it("POST rejects a missing or non-string text", async () => {
    const { id } = await makeDemoSession("bad-add");
    expect((await addQuestionRoute(send("POST", {}), ctx({ id }))).status).toBe(400);
    expect((await add(id, 42)).status).toBe(400);
  });
});

describe("a completed session", () => {
  it("freezes wording and structure, but still takes notes and ticks", async () => {
    const s = await makeDemoSession("completed");
    const q = await first(s.id);
    await buildClientReview(s.id);
    expect((await statusRoute(send("POST", { to: "COMPLETED" }), ctx({ id: s.id }))).status).toBe(200);

    expect((await patch(s.id, q.id, { text: "Changed after the fact" })).status).toBe(409);
    expect((await add(s.id, "A late addition here")).status).toBe(409);
    expect((await deleteQuestionRoute(send("DELETE"), ctx({ id: s.id, questionId: q.id }))).status).toBe(409);
    expect((await first(s.id)).text).not.toBe("Changed after the fact");

    expect((await patch(s.id, q.id, { notes: "A reflection after the call." })).status).toBe(200);
    expect((await first(s.id)).notes).toBe("A reflection after the call.");
  });
});
