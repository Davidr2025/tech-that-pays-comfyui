/** Editing a prototype: every operation, every rejection, and that it all persists. Real routes, real (test) database. */
import { beforeAll, describe, expect, it } from "vitest";
import { POST as editRoute } from "@/app/api/sessions/[id]/prototype/route";
import { POST as statusRoute } from "@/app/api/sessions/[id]/status/route";
import { prisma } from "@/lib/db";
import { PROTOTYPE_LIMITS } from "@/lib/prototype/schema";
import { getRevealPayload } from "@/server/reveal";
import { getPrototype } from "@/server/prototype";
import { buildClientReview } from "@/server/review";
import { findLeaks, makeAssessmentSession } from "./helpers";

const send = (body: unknown) => new Request("http://t/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

interface Fixture {
  sessionId: string;
  ids: Record<"nurture" | "content" | "finance" | "security", string>;
}
async function fixture(label: string): Promise<Fixture> {
  const s = await makeAssessmentSession(label);
  await buildClientReview(s.id);
  const rows = await prisma.prototypeModule.findMany({ where: { sessionId: s.id } });
  const ids = Object.fromEntries(rows.map((r) => [r.moduleType, r.id])) as Fixture["ids"];
  expect(Object.keys(ids).sort()).toEqual(["content", "finance", "nurture", "security"]);
  return { sessionId: s.id, ids };
}
const post = (f: Fixture, body: Record<string, unknown>, sessionId = f.sessionId) => editRoute(send(body), ctx({ id: sessionId }));
const stored = async (f: Fixture) => (await getPrototype(f.sessionId))!;
const mod = async <T extends string>(f: Fixture, type: T) => (await stored(f)).modules.find((m) => m.module.type === type)!.module.data as never as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const message = async (res: Response) => ((await res.json()) as { error: string }).error;

let f: Fixture;
beforeAll(async () => {
  f = await fixture("proto-edit");
});

describe("content drafts", () => {
  it("start pending, and approval persists across a re-read", async () => {
    const draft = (await mod(f, "content")).drafts[0];
    expect(draft).toMatchObject({ status: "pending", edited: false });
    const res = await post(f, { op: "draft", moduleId: f.ids.content, draftId: draft.id, status: "approved" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { module: { module: { data: { drafts: { status: string }[] } } } }).module.module.data.drafts[0]!.status).toBe("approved");
    expect((await mod(f, "content")).drafts[0].status).toBe("approved"); // read back from the database
  });

  it("can be undone, and rejected", async () => {
    const id = (await mod(f, "content")).drafts[1].id;
    await post(f, { op: "draft", moduleId: f.ids.content, draftId: id, status: "rejected" });
    expect((await mod(f, "content")).drafts[1].status).toBe("rejected");
    await post(f, { op: "draft", moduleId: f.ids.content, draftId: id, status: "pending" });
    expect((await mod(f, "content")).drafts[1].status).toBe("pending");
  });

  it("an edit keeps the new wording and marks the draft as edited; resaving identical text does not", async () => {
    const d = (await mod(f, "content")).drafts[2];
    await post(f, { op: "draft", moduleId: f.ids.content, draftId: d.id, body: "  A warmer opening line.\nSecond line.  " });
    const after = (await mod(f, "content")).drafts[2];
    expect(after).toMatchObject({ body: "A warmer opening line.\nSecond line.", edited: true, status: "pending" });
    const again = (await mod(f, "content")).drafts[2];
    await post(f, { op: "draft", moduleId: f.ids.content, draftId: d.id, body: again.body });
    expect((await mod(f, "content")).drafts[2].edited).toBe(true); // stays edited
  });

  it.each([
    ["an unknown draft", { draftId: "nope", status: "approved" }, 400, /no longer exists/],
    ["nothing to change", { draftId: "$first" }, 400, /Nothing to change/],
    ["an empty body", { draftId: "$first", body: "   " }, 400, /cannot be empty/],
    ["an oversized body", { draftId: "$first", body: "x".repeat(PROTOTYPE_LIMITS.draftBody + 1) }, 400, /under 2000/],
    ["an invented status", { draftId: "$first", status: "published" }, 400, null],
  ])("refuses %s", async (_n, extra, status, text) => {
    const first = (await mod(f, "content")).drafts[0].id;
    const body = JSON.parse(JSON.stringify({ op: "draft", moduleId: f.ids.content, ...extra }).replace("$first", first));
    const res = await post(f, body);
    expect(res.status).toBe(status);
    if (text) expect(await message(res)).toMatch(text);
  });
});

describe("financial figures", () => {
  it("entered figures replace the line, are labelled entered, and the rest keep their source", async () => {
    const before = await mod(f, "finance");
    const res = await post(f, { op: "finance", moduleId: f.ids.finance, lines: [{ key: "revenue", actual: 120000, budget: 150000 }, { key: "payroll", actual: 41000.5, budget: 42000 }] });
    expect(res.status).toBe(200);
    const after = await mod(f, "finance");
    const line = (k: string) => after.lines.find((l: { key: string }) => l.key === k);
    expect(line("revenue")).toMatchObject({ actual: 120000, budget: 150000, source: "entered" });
    expect(line("payroll")).toMatchObject({ actual: 41000.5, budget: 42000, source: "entered" });
    const untouched = before.lines.find((l: { key: string }) => l.key === "overhead");
    expect(line("overhead")).toEqual(untouched);
  });

  it("only a changed actual becomes Entered: resubmitting untouched lines keeps their provenance", async () => {
    const s = await fixture("proto-provenance");
    const lines = (await mod(s, "finance")).lines as { key: string; actual: number; budget: number; source: string }[];
    const sources = Object.fromEntries(lines.map((l) => [l.key, l.source]));
    expect(Object.values(sources)).toContain("stated"); // the fixture has call-sourced lines, so this is not vacuous
    // The form submits all four lines, changing only revenue's actual and payroll's budget.
    const submit = lines.map((l) => ({ key: l.key, actual: l.key === "revenue" ? l.actual + 1000 : l.actual, budget: l.key === "payroll" ? l.budget + 500 : l.budget }));
    expect((await post(s, { op: "finance", moduleId: s.ids.finance, lines: submit })).status).toBe(200);
    const after = Object.fromEntries(((await mod(s, "finance")).lines as { key: string; source: string }[]).map((l) => [l.key, l.source]));
    expect(after.revenue).toBe("entered"); // its actual changed
    expect(after.payroll).toBe(sources.payroll); // only its budget changed: the actual is still what it was
    expect(after.receivables).toBe(sources.receivables);
    expect(after.overhead).toBe(sources.overhead);
    // Typing the same actual again changes nothing about where it came from.
    await post(s, { op: "finance", moduleId: s.ids.finance, lines: [{ key: "revenue", actual: lines[0]!.key === "revenue" ? lines[0]!.actual + 1000 : 1, budget: lines.find((l) => l.key === "revenue")!.budget }] });
    expect(((await mod(s, "finance")).lines as { key: string; source: string }[]).find((l) => l.key === "revenue")!.source).toBe("entered");
  });

  it.each([
    ["a zero budget", [{ key: "revenue", actual: 1, budget: 0 }]],
    ["a negative actual", [{ key: "revenue", actual: -5, budget: 10 }]],
    ["an absurd amount", [{ key: "revenue", actual: 1e12, budget: 10 }]],
    ["an unknown line", [{ key: "taxes", actual: 1, budget: 10 }]],
    ["the same line twice", [{ key: "revenue", actual: 1, budget: 10 }, { key: "revenue", actual: 2, budget: 10 }]],
    ["no lines", []],
    ["a string for a number", [{ key: "revenue", actual: "5", budget: 10 }]],
    ["an extra field on a line", [{ key: "revenue", actual: 1, budget: 10, source: "stated" }]],
  ])("refuses %s", async (_n, lines) => {
    expect((await post(f, { op: "finance", moduleId: f.ids.finance, lines })).status).toBe(400);
  });

  it("tells the person what is wrong in plain words", async () => {
    const say = async (line: Record<string, unknown>) => message(await post(f, { op: "finance", moduleId: f.ids.finance, lines: [{ key: "revenue", actual: 1, budget: 10, ...line }] }));
    expect(await say({ budget: 0 })).toBe("A budget must be above zero.");
    expect(await say({ actual: -1 })).toBe("An amount cannot be negative.");
    expect(await say({ actual: 1e12 })).toBe("That amount is too large.");
    expect(await say({ actual: "12" })).toBe("Enter a number.");
  });

  it("a refused edit changes nothing", async () => {
    const before = JSON.stringify(await mod(f, "finance"));
    await post(f, { op: "finance", moduleId: f.ids.finance, lines: [{ key: "revenue", actual: 1, budget: 0 }] });
    expect(JSON.stringify(await mod(f, "finance"))).toBe(before);
  });
});

describe("security alerts", () => {
  it("adds an alert at the top, always flagged as an example, and removes it again", async () => {
    const res = await post(f, { op: "alert.add", moduleId: f.ids.security, severity: "high", title: "  Former contractor still has access  ", detail: "Asana seat never removed.", tool: "Asana" });
    expect(res.status).toBe(200);
    const feed = (await mod(f, "security")).feed;
    expect(feed[0]).toMatchObject({ severity: "high", title: "Former contractor still has access", detail: "Asana seat never removed.", tool: "Asana", minutesAgo: 0, example: true });
    expect(feed[0].id).toMatch(/^x[0-9a-f]{8}$/);
    const count = feed.length;
    expect((await post(f, { op: "alert.remove", moduleId: f.ids.security, alertId: feed[0].id })).status).toBe(200);
    expect((await mod(f, "security")).feed).toHaveLength(count - 1);
  });

  it("detail and tool are optional", async () => {
    await post(f, { op: "alert.add", moduleId: f.ids.security, severity: "low", title: "Minor thing" });
    expect((await mod(f, "security")).feed[0]).toMatchObject({ title: "Minor thing", detail: "", tool: null });
  });

  it("cannot be made non-example, and refuses unknown fields", async () => {
    expect((await post(f, { op: "alert.add", moduleId: f.ids.security, severity: "low", title: "x", example: false })).status).toBe(400);
    expect((await post(f, { op: "alert.add", moduleId: f.ids.security, severity: "low", title: "x", coaching: "leak" })).status).toBe(400);
    expect((await post(f, { op: "alert.add", moduleId: f.ids.security, severity: "critical", title: "x" })).status).toBe(400);
  });

  it("holds at most 50, and removing an unknown one is refused", async () => {
    const s = await fixture("proto-limit");
    const have = (await mod(s, "security")).feed.length;
    for (let i = have; i < PROTOTYPE_LIMITS.alerts; i++) expect((await post(s, { op: "alert.add", moduleId: s.ids.security, severity: "low", title: `A${i}` })).status).toBe(200);
    const over = await post(s, { op: "alert.add", moduleId: s.ids.security, severity: "low", title: "one too many" });
    expect(over.status).toBe(400);
    expect(await message(over)).toMatch(/at most 50/);
    expect((await post(s, { op: "alert.remove", moduleId: s.ids.security, alertId: "nope" })).status).toBe(400);
  });
});

describe("contacts", () => {
  it("adds a real contact (not an example), and removing every contact is allowed", async () => {
    const s = await fixture("proto-contacts");
    const res = await post(s, { op: "contact.add", moduleId: s.ids.nurture, label: " Dental Group Ltd ", stage: "Proposal sent", temperature: "hot", daysSinceContact: 3, nextAction: "Call on Friday." });
    expect(res.status).toBe(200);
    const contacts = (await mod(s, "nurture")).contacts;
    expect(contacts[0]).toMatchObject({ label: "Dental Group Ltd", stage: "Proposal sent", temperature: "hot", daysSinceContact: 3, nextAction: "Call on Friday.", example: false });
    for (const c of contacts) expect((await post(s, { op: "contact.remove", moduleId: s.ids.nurture, contactId: c.id })).status).toBe(200);
    expect((await mod(s, "nurture")).contacts).toEqual([]);
    expect((await getPrototype(s.sessionId))!.modules.length).toBe(4); // an empty list is still a valid prototype
  });

  it.each([
    ["a negative number of days", { daysSinceContact: -1 }],
    ["a fractional number of days", { daysSinceContact: 2.5 }],
    ["an absurd number of days", { daysSinceContact: 99999 }],
    ["a missing next action", { nextAction: "" }],
    ["an unknown temperature", { temperature: "lukewarm" }],
    ["a forged example flag", { example: true }],
  ])("refuses %s", async (_n, override) => {
    const body = { op: "contact.add", moduleId: f.ids.nurture, label: "X", stage: "", temperature: "warm", daysSinceContact: 1, nextAction: "Call", ...override };
    expect((await post(f, body)).status).toBe(400);
  });
});

describe("targets and permissions", () => {
  it("an operation only applies to its own module", async () => {
    const draft = (await mod(f, "content")).drafts[0].id;
    const res = await post(f, { op: "draft", moduleId: f.ids.finance, draftId: draft, status: "approved" });
    expect(res.status).toBe(400);
    expect(await message(res)).toMatch(/does not apply/);
  });

  it("a module of another session is not found, and is not changed", async () => {
    const other = await fixture("proto-other");
    const before = JSON.stringify(await mod(other, "finance"));
    const res = await post(f, { op: "finance", moduleId: other.ids.finance, lines: [{ key: "revenue", actual: 1, budget: 2 }] });
    expect(res.status).toBe(404);
    expect(JSON.stringify(await mod(other, "finance"))).toBe(before);
    expect((await post(f, { op: "alert.remove", moduleId: "no-such-module", alertId: "x" })).status).toBe(404);
  });

  it("is frozen once the session is complete", async () => {
    const s = await fixture("proto-done");
    await statusRoute(send({ to: "COMPLETED" }), ctx({ id: s.sessionId }));
    const before = JSON.stringify(await stored(s));
    const res = await post(s, { op: "alert.add", moduleId: s.ids.security, severity: "low", title: "too late" });
    expect(res.status).toBe(409);
    expect(JSON.stringify(await stored(s))).toBe(before);
  });

  it("refuses a perfectly valid change that carries one extra field, and applies nothing", async () => {
    const draft = (await mod(f, "content")).drafts[0];
    const before = JSON.stringify(await mod(f, "content"));
    for (const extra of [{ coaching: "private" }, { example: false }, { internalNotes: "x" }]) {
      const res = await post(f, { op: "draft", moduleId: f.ids.content, draftId: draft.id, status: "approved", ...extra });
      expect(res.status, JSON.stringify(extra)).toBe(400);
    }
    expect(JSON.stringify(await mod(f, "content"))).toBe(before);
  });

  it("rejects bodies that are not a known operation", async () => {
    for (const body of [{}, { op: "delete-everything", moduleId: f.ids.content }, { op: "draft" }, { op: "draft", moduleId: f.ids.content, draftId: "x", extra: 1 }]) {
      expect((await post(f, body as Record<string, unknown>)).status, JSON.stringify(body)).toBe(400);
    }
  });
});

describe("what editing does not touch", () => {
  it("what is typed shows only in the prototype: the reveal and private fields are unchanged", async () => {
    const s = await fixture("proto-private");
    const MARK = "TYPED-ALERT-MARK-77c1e0";
    await prisma.session.update({ where: { id: s.sessionId }, data: { internalNotes: "private note stays private" } });
    const revealBefore = JSON.stringify(await getRevealPayload(s.sessionId));
    await post(s, { op: "alert.add", moduleId: s.ids.security, severity: "low", title: MARK });
    expect(findLeaks(JSON.stringify(await stored(s)), [MARK])).toEqual([MARK]); // it is in the prototype, as intended
    expect(JSON.stringify(await getRevealPayload(s.sessionId))).toBe(revealBefore);
    expect(findLeaks(JSON.stringify(await stored(s)), ["private note stays private"])).toEqual([]);
    expect((await prisma.session.findUniqueOrThrow({ where: { id: s.sessionId } })).internalNotes).toBe("private note stays private");
  });

  it("rebuilding the review regenerates the prototype and discards edits (documented behaviour)", async () => {
    const s = await fixture("proto-rebuild");
    await post(s, { op: "alert.add", moduleId: s.ids.security, severity: "low", title: "Edited then rebuilt" });
    await buildClientReview(s.sessionId);
    expect(JSON.stringify(await stored(s))).not.toContain("Edited then rebuilt");
  });

  it("a module stored before status/edited existed still reads, with defaults", async () => {
    const s = await fixture("proto-legacy");
    const row = await prisma.prototypeModule.findFirstOrThrow({ where: { sessionId: s.sessionId, moduleType: "content" } });
    const data = row.data as { drafts: Record<string, unknown>[] };
    await prisma.prototypeModule.update({ where: { id: row.id }, data: { data: { ...data, drafts: data.drafts.map((d) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== "status" && k !== "edited"))) } as object } });
    expect((await mod(s, "content")).drafts.every((d: { status: string; edited: boolean }) => d.status === "pending" && d.edited === false)).toBe(true);
  });
});
