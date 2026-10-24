import { prisma } from "../lib/db";
import { bankFor } from "../lib/mock-ai/banks";
import type { SessionType } from "../lib/session-types";

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
