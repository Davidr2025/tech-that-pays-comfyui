import { randomUUID } from "node:crypto";
import { prisma } from "../lib/db";
import { bankFor } from "../lib/mock-ai/banks";
import type { SessionType } from "../lib/session-types";

export class QuestionError extends Error {
  constructor(
    public code: "NOT_FOUND" | "INVALID" | "CONFLICT",
    message: string,
  ) {
    super(message);
  }
}

export const CUSTOM_PREFIX = "custom_";
export const MAX_QUESTION_CHARS = 300;
export const MAX_NOTE_CHARS = 2000;

export const isCustomTopic = (topic: string) => topic.startsWith(CUSTOM_PREFIX);

/** Starts a session with the question bank for its type (a combined assessment asks both). */
export async function createDefaultQuestions(sessionId: string, type: SessionType = "DISCOVERY") {
  await prisma.question.createMany({
    data: bankFor(type).map((q, order) => ({ sessionId, topic: q.topic, text: q.text, order })),
  });
}

/** Manual toggle from the checklist. A manual check is never marked as AI-detected. */
export async function setQuestionCovered(sessionId: string, questionId: string, covered: boolean) {
  const result = await prisma.question.updateMany({
    where: { id: questionId, sessionId },
    data: { isCovered: covered, coveredByAI: false },
  });
  return result.count === 1;
}

/** Clears every manual and AI coverage mark (used when a call is restarted). */
export async function resetQuestions(sessionId: string) {
  await prisma.question.updateMany({ where: { sessionId }, data: { isCovered: false, coveredByAI: false } });
}

/** Wording and structure of the checklist are frozen with the rest of a completed session. */
async function assertEditable(sessionId: string) {
  const s = await prisma.session.findUnique({ where: { id: sessionId }, select: { status: true } });
  if (!s) throw new QuestionError("NOT_FOUND", "Session not found.");
  if (s.status === "COMPLETED") throw new QuestionError("CONFLICT", "This session is complete, so its questions can no longer be changed.");
}

const cleanText = (text: string) => {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 3) throw new QuestionError("INVALID", "A question needs at least a few words.");
  if (t.length > MAX_QUESTION_CHARS) throw new QuestionError("INVALID", `Keep a question under ${MAX_QUESTION_CHARS} characters.`);
  return t;
};

export interface QuestionPatch {
  covered?: boolean;
  /** Empty or null clears the note. */
  notes?: string | null;
  text?: string;
}

/** Edits one question: a tick, a private note, or its wording (the topic, and so AI detection, stays). */
export async function updateQuestion(sessionId: string, questionId: string, patch: QuestionPatch) {
  const existing = await prisma.question.findFirst({ where: { id: questionId, sessionId } });
  if (!existing) throw new QuestionError("NOT_FOUND", "Question not found.");
  const data: { isCovered?: boolean; coveredByAI?: boolean; notes?: string | null; text?: string } = {};
  if (patch.covered !== undefined) Object.assign(data, { isCovered: patch.covered, coveredByAI: false });
  if (patch.notes !== undefined) {
    const n = patch.notes?.trim() ?? "";
    if (n.length > MAX_NOTE_CHARS) throw new QuestionError("INVALID", `Keep a note under ${MAX_NOTE_CHARS} characters.`);
    data.notes = n === "" ? null : n;
  }
  if (patch.text !== undefined) {
    await assertEditable(sessionId);
    data.text = cleanText(patch.text);
  }
  return prisma.question.update({ where: { id: questionId }, data });
}

/** Adds a question of the consultant's own. It is only ever ticked by hand: no detector knows about it. */
export async function addQuestion(sessionId: string, text: string) {
  await assertEditable(sessionId);
  const clean = cleanText(text);
  const last = await prisma.question.findFirst({ where: { sessionId }, orderBy: { order: "desc" }, select: { order: true } });
  return prisma.question.create({
    data: { sessionId, topic: `${CUSTOM_PREFIX}${randomUUID().slice(0, 8)}`, text: clean, order: (last?.order ?? -1) + 1 },
  });
}

export async function deleteQuestion(sessionId: string, questionId: string) {
  await assertEditable(sessionId);
  const result = await prisma.question.deleteMany({ where: { id: questionId, sessionId } });
  if (result.count !== 1) throw new QuestionError("NOT_FOUND", "Question not found.");
}
