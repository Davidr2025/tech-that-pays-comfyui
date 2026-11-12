/** Stages the two demo calls for a consultant, so a new account has something to press Play on. */
import { prisma } from "../lib/db";
import { ASSESSMENT_SEGMENTS, DEMO_ASSESSMENT_TITLE } from "../lib/demo/assessment-call";
import { DEMO_CLIENT, DEMO_INTERNAL_NOTES, DEMO_SESSION_TITLE } from "../lib/demo/demo-call";
import { createDefaultQuestions } from "./questions";
import { demoTranscript, replaceTranscript } from "./sessions";

export async function stageDemoFor(consultantId: string) {
  const client = await prisma.client.create({ data: { consultantId, ...DEMO_CLIENT } });
  const discovery = await prisma.session.create({
    data: { consultantId, clientId: client.id, type: "DISCOVERY", title: `${DEMO_SESSION_TITLE} (demo)`, internalNotes: DEMO_INTERNAL_NOTES },
  });
  await createDefaultQuestions(discovery.id);
  await replaceTranscript(discovery.id, demoTranscript());
  const assessment = await prisma.session.create({
    data: { consultantId, clientId: client.id, type: "COMBINED_ASSESSMENT", title: `${DEMO_ASSESSMENT_TITLE} (demo)` },
  });
  await createDefaultQuestions(assessment.id, "COMBINED_ASSESSMENT");
  await replaceTranscript(assessment.id, ASSESSMENT_SEGMENTS.map((s) => ({ speaker: s.speaker, text: s.text })));
  // Loading a transcript starts a call; these are staged, not started.
  await prisma.session.updateMany({ where: { id: { in: [discovery.id, assessment.id] } }, data: { status: "SETUP", startedAt: null } });
}
