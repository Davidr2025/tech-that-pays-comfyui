import type { Question } from "@prisma/client";
import { isCustomTopic } from "./questions";

/** The shape the cockpit works with. Only a MANUAL check is restored on load; AI detection is recomputed as the call plays. */
export function toQuestionView(q: Pick<Question, "id" | "topic" | "text" | "notes" | "isCovered" | "coveredByAI">) {
  return { id: q.id, topic: q.topic, text: q.text, notes: q.notes ?? "", custom: isCustomTopic(q.topic), manuallyCovered: q.isCovered && !q.coveredByAI };
}
export type QuestionView = ReturnType<typeof toQuestionView>;
