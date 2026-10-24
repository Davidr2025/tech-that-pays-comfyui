import { prisma } from "../lib/db";
import { QUESTION_BANK } from "../lib/mock-ai/questions";

export async function createDefaultQuestions(sessionId: string) {
  await prisma.question.createMany({
    data: QUESTION_BANK.map((q, order) => ({ sessionId, topic: q.topic, text: q.text, order })),
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
