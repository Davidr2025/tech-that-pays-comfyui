import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db";
import { DEMO_SEGMENTS } from "../lib/demo/demo-call";
import type { ParsedSegment } from "../lib/transcript";
import { createDefaultQuestions } from "./questions";

/** Everything the (private) cockpit page needs. Plain JSON-serialisable data. */
export async function getCockpitData(sessionId: string) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      client: true,
      consultant: true,
      segments: { orderBy: { order: "asc" } },
      questions: { orderBy: { order: "asc" } },
      report: { select: { id: true } },
    },
  });
  if (!session) return null;
  return {
    id: session.id,
    title: session.title,
    consultantName: session.consultant.name,
    clientName: session.client.name,
    clientCompany: session.client.companyName,
    hasReport: session.report !== null,
    segments: session.segments.map((s) => ({ order: s.order, speaker: s.speaker, text: s.text })),
    questions: session.questions.map((q) => ({
      id: q.id,
      topic: q.topic,
      text: q.text,
      // Only a MANUAL check is restored on load; AI detection is recomputed as the call plays.
      manuallyCovered: q.isCovered && !q.coveredByAI,
    })),
  };
}

export type CockpitData = NonNullable<Awaited<ReturnType<typeof getCockpitData>>>;

/** Replaces the session's transcript. Anything derived from the old one is discarded. */
export async function replaceTranscript(sessionId: string, segments: ParsedSegment[]) {
  await prisma.$transaction([
    prisma.transcriptSegment.deleteMany({ where: { sessionId } }),
    prisma.transcriptSegment.createMany({
      data: segments.map((s, order) => ({ sessionId, speaker: s.speaker, text: s.text, order })),
    }),
    prisma.extraction.deleteMany({ where: { sessionId } }),
    prisma.report.deleteMany({ where: { sessionId } }),
    prisma.session.update({ where: { id: sessionId }, data: { coaching: Prisma.DbNull, decisionReadiness: null } }),
    // A new transcript is a new call: every question starts uncovered, manual ticks included.
    prisma.question.updateMany({ where: { sessionId }, data: { isCovered: false, coveredByAI: false } }),
  ]);
}

export function demoTranscript(): ParsedSegment[] {
  return DEMO_SEGMENTS.map((s) => ({ speaker: s.speaker, text: s.text }));
}

export async function listSessions() {
  const rows = await prisma.session.findMany({
    orderBy: { createdAt: "desc" },
    include: { client: true, report: { select: { id: true } }, _count: { select: { segments: true } } },
  });
  return rows.map((s) => ({
    id: s.id,
    title: s.title,
    clientName: s.client.name,
    clientCompany: s.client.companyName,
    segmentCount: s._count.segments,
    hasReport: s.report !== null,
  }));
}

/** Creates a blank discovery session for the (single, demo) consultant. */
export async function createSession(input: { clientName: string; companyName: string }) {
  const consultant = await prisma.consultant.findFirst({ orderBy: { createdAt: "asc" } });
  if (!consultant) throw new Error("No consultant exists yet — run `npm run db:seed`.");
  const client = await prisma.client.create({
    data: { consultantId: consultant.id, name: input.clientName, companyName: input.companyName },
  });
  const session = await prisma.session.create({
    data: {
      consultantId: consultant.id,
      clientId: client.id,
      type: "DISCOVERY",
      title: `Discovery call — ${input.companyName}`,
    },
  });
  await createDefaultQuestions(session.id);
  return session;
}
