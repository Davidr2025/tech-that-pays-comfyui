import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { buildClientReview, ReviewError } from "@/server/review";
import { getRevealPayload } from "@/server/reveal";
import { setQuestionCovered } from "@/server/questions";
import { replaceTranscript, demoTranscript } from "@/server/sessions";
import { makeDemoSession } from "./helpers";

describe("buildClientReview", () => {
  let sessionId: string;

  beforeAll(async () => {
    sessionId = (await makeDemoSession("review")).id;
  });

  it("refuses to build from an empty transcript", async () => {
    const empty = await makeDemoSession("empty");
    await prisma.transcriptSegment.deleteMany({ where: { sessionId: empty.id } });
    await expect(buildClientReview(empty.id)).rejects.toMatchObject({ code: "NO_TRANSCRIPT" });
    await expect(buildClientReview("nope")).rejects.toBeInstanceOf(ReviewError);
  });

  it("stores private analysis on the session and a separate allow-listed report", async () => {
    await buildClientReview(sessionId);
    const s = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(s.decisionReadiness).toBe(77);
    expect(JSON.stringify(s.coaching)).toContain("Budget, urgency and decision-maker confirmed");

    const counts = await prisma.extraction.groupBy({ by: ["kind"], where: { sessionId }, _count: true });
    expect(Object.fromEntries(counts.map((c) => [c.kind, c._count]))).toEqual({
      PAIN_POINT: 6,
      DOLLAR: 8,
      TECH_STACK: 5,
      SIGNAL: 2,
      OBJECTION: 1,
    });

    const reveal = await getRevealPayload(sessionId);
    expect(reveal?.totals).toMatchObject({ monthly: 206, annual: 2472 });
  });

  it("marks AI-detected questions as such, and leaves manual checks as manual", async () => {
    const fresh = await makeDemoSession("coverage");
    const questions = await prisma.question.findMany({ where: { sessionId: fresh.id } });
    const manual = questions.find((q) => q.topic === "overview")!;
    expect(await setQuestionCovered(fresh.id, manual.id, true)).toBe(true);

    await buildClientReview(fresh.id);
    const after = await prisma.question.findMany({ where: { sessionId: fresh.id } });
    expect(after.every((q) => q.isCovered)).toBe(true);
    expect(after.find((q) => q.topic === "overview")).toMatchObject({ isCovered: true, coveredByAI: false });
    expect(after.find((q) => q.topic === "budget")).toMatchObject({ isCovered: true, coveredByAI: true });
  });

  it("only reviews the part of the call that has played (upTo)", async () => {
    const partial = await makeDemoSession("partial");
    const { analysis } = await buildClientReview(partial.id, { upTo: 4 });
    expect(analysis.topicsCovered).toEqual(["overview", "team", "process", "pain"]);
    const reveal = await getRevealPayload(partial.id);
    expect(reveal?.techStack.map((t) => t.tool)).toEqual(["Google Sheets", "QuickBooks"]);
    expect(reveal?.totals.monthly).toBe(0);
  });

  it("is idempotent: rebuilding replaces the report and extractions", async () => {
    await buildClientReview(sessionId);
    await buildClientReview(sessionId);
    expect(await prisma.report.count({ where: { sessionId } })).toBe(1);
    expect(await prisma.extraction.count({ where: { sessionId } })).toBe(22);
  });

  it("a new transcript invalidates the old report and AI coverage", async () => {
    await replaceTranscript(sessionId, demoTranscript().slice(0, 2));
    expect(await getRevealPayload(sessionId)).toBeNull();
    expect(await prisma.extraction.count({ where: { sessionId } })).toBe(0);
    const s = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(s.decisionReadiness).toBeNull();
    expect(s.coaching).toBeNull();
    expect(await prisma.question.count({ where: { sessionId, coveredByAI: true } })).toBe(0);
  });
});
