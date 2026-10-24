import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/db";
import { DEMO_SEGMENTS } from "../lib/demo/demo-call";
import { assertTransition, type SessionStatus } from "../lib/sessions";
import type { ParsedSegment } from "../lib/transcript";
import { sessionCreateSchema } from "../lib/validation";
import { ASSESSMENT_SEGMENTS } from "../lib/demo/assessment-call";
import { isAssessment, SESSION_TYPE_INFO, type SessionType } from "../lib/session-types";
import { parseBrandColors } from "./clients";
import { toQuestionView } from "./question-view";
import { createDefaultQuestions } from "./questions";

export class SessionError extends Error {
  constructor(
    public code: "NOT_FOUND" | "INVALID" | "CONFLICT",
    message: string,
  ) {
    super(message);
  }
}

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
      prototype: { select: { id: true } },
    },
  });
  if (!session) return null;
  return {
    id: session.id,
    title: session.title,
    status: session.status as SessionStatus,
    type: session.type,
    brandingMode: session.brandingMode,
    consultantName: session.consultant.name,
    clientName: session.client.name,
    clientCompany: session.client.companyName,
    clientHasBrand: parseBrandColors(session.client.brandColors) !== null,
    hasReport: session.report !== null,
    hasPrototype: session.prototype.length > 0,
    segments: session.segments.map((s) => ({ order: s.order, speaker: s.speaker, text: s.text, startSec: s.startSec })),
    internalNotes: session.internalNotes ?? "",
    questions: session.questions.map(toQuestionView),
  };
}

export type CockpitData = NonNullable<Awaited<ReturnType<typeof getCockpitData>>>;

async function currentStatus(sessionId: string) {
  const s = await prisma.session.findUnique({ where: { id: sessionId }, select: { status: true, startedAt: true } });
  if (!s) throw new SessionError("NOT_FOUND", "Session not found.");
  return { status: s.status as SessionStatus, startedAt: s.startedAt };
}

function guard(from: SessionStatus, to: SessionStatus) {
  try {
    assertTransition(from, to);
  } catch (err) {
    throw new SessionError("CONFLICT", err instanceof Error ? err.message : "That change is not allowed.");
  }
}

/**
 * Replaces the session's transcript. Anything derived from the old one is discarded, and the
 * session goes (back) to LIVE.
 */
export async function replaceTranscript(sessionId: string, segments: ParsedSegment[]) {
  const { status, startedAt } = await currentStatus(sessionId);
  guard(status, "LIVE");
  await prisma.$transaction([
    prisma.transcriptSegment.deleteMany({ where: { sessionId } }),
    prisma.transcriptSegment.createMany({
      data: segments.map((s, order) => ({ sessionId, speaker: s.speaker, text: s.text, order, startSec: s.startSec ?? null })),
    }),
    prisma.extraction.deleteMany({ where: { sessionId } }),
    prisma.report.deleteMany({ where: { sessionId } }),
    prisma.prototypeModule.deleteMany({ where: { sessionId } }),
    prisma.session.update({
      where: { id: sessionId },
      data: { coaching: Prisma.DbNull, decisionReadiness: null, status: "LIVE", startedAt: startedAt ?? new Date() },
    }),
    // A new transcript is a new call: every question starts uncovered, manual ticks included.
    prisma.question.updateMany({ where: { sessionId }, data: { isCovered: false, coveredByAI: false } }),
  ]);
}

/** Adds one typed line to the end of the transcript (the MANUAL source). */
export async function appendSegment(sessionId: string, seg: { speaker: "CONSULTANT" | "CLIENT"; text: string; startSec?: number | null }) {
  const { status, startedAt } = await currentStatus(sessionId);
  guard(status, "LIVE");
  const last = await prisma.transcriptSegment.aggregate({ where: { sessionId }, _max: { order: true } });
  const order = (last._max.order ?? -1) + 1;
  const [created] = await prisma.$transaction([
    prisma.transcriptSegment.create({ data: { sessionId, speaker: seg.speaker, text: seg.text, order, startSec: seg.startSec ?? null } }),
    prisma.session.update({ where: { id: sessionId }, data: { status: "LIVE", startedAt: startedAt ?? new Date() } }),
  ]);
  return { order: created.order, speaker: created.speaker, text: created.text, startSec: created.startSec };
}

/** The statuses a consultant may set directly. Everything else follows from their actions. */
export async function setSessionStatus(sessionId: string, to: "REVEALED" | "COMPLETED") {
  const { status } = await currentStatus(sessionId);
  if (to === "REVEALED" && (status === "SETUP" || status === "LIVE")) {
    // Say what to do, rather than describing the state machine. (LIVE can still hold an old review
    // if lines were typed after it was built; that review no longer matches the call.)
    throw new SessionError("CONFLICT", "Build the client review before revealing it.");
  }
  guard(status, to);
  await prisma.session.update({
    where: { id: sessionId },
    data: { status: to, ...(to === "COMPLETED" ? { endedAt: new Date() } : {}) },
  });
  return to;
}

/** The built-in call that fits the session: the discovery call, or the assessment follow-up. */
export function demoTranscript(type: SessionType = "DISCOVERY"): ParsedSegment[] {
  const source = isAssessment(type) ? ASSESSMENT_SEGMENTS : DEMO_SEGMENTS;
  return source.map((s) => ({ speaker: s.speaker, text: s.text }));
}

export async function listSessions(consultantId?: string) {
  const rows = await prisma.session.findMany({
    where: consultantId ? { consultantId } : undefined,
    orderBy: { createdAt: "desc" },
    include: { client: true, report: { select: { id: true } }, _count: { select: { segments: true } } },
  });
  return rows.map((s) => ({
    id: s.id,
    title: s.title,
    status: s.status as SessionStatus,
    type: s.type,
    clientName: s.client.name,
    clientCompany: s.client.companyName,
    segmentCount: s._count.segments,
    hasReport: s.report !== null,
  }));
}

/** Creates a session for one of this consultant's clients. */
export async function createSession(consultantId: string, input: z.output<typeof sessionCreateSchema>) {
  if (!SESSION_TYPE_INFO[input.type].available) throw new SessionError("INVALID", "That session type is not available.");
  const client = await prisma.client.findFirst({ where: { id: input.clientId, consultantId } });
  if (!client) throw new SessionError("NOT_FOUND", "That client was not found.");
  if (input.brandingMode === "CLIENT" && !parseBrandColors(client.brandColors)) {
    throw new SessionError("INVALID", "Add this client's brand colours before using their branding.");
  }
  const session = await prisma.session.create({
    data: {
      consultantId,
      clientId: client.id,
      type: input.type,
      brandingMode: input.brandingMode,
      title: `${SESSION_TYPE_INFO[input.type].label} — ${client.companyName}`,
    },
  });
  await createDefaultQuestions(session.id, input.type);
  return session;
}

export const MAX_CALL_NOTES_CHARS = 10_000;

/** The consultant's private notes on the whole call. Editable in every status, including after the session is complete. */
export async function setInternalNotes(sessionId: string, notes: string | null) {
  const text = notes?.trim() ?? "";
  if (text.length > MAX_CALL_NOTES_CHARS) throw new SessionError("INVALID", `Keep call notes under ${MAX_CALL_NOTES_CHARS.toLocaleString("en-US")} characters.`);
  const result = await prisma.session.updateMany({ where: { id: sessionId }, data: { internalNotes: text === "" ? null : text } });
  if (result.count !== 1) throw new SessionError("NOT_FOUND", "Session not found.");
}

export async function setBrandingMode(sessionId: string, brandingMode: "CONSULTANT" | "CLIENT") {
  const session = await prisma.session.findUnique({ where: { id: sessionId }, include: { client: true } });
  if (!session) throw new SessionError("NOT_FOUND", "Session not found.");
  if (brandingMode === "CLIENT" && !parseBrandColors(session.client.brandColors)) {
    throw new SessionError("INVALID", "Add this client's brand colours before using their branding.");
  }
  await prisma.session.update({ where: { id: sessionId }, data: { brandingMode } });
}
