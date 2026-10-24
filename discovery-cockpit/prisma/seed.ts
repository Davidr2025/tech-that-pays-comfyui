import { prisma } from "../src/lib/db";
import {
  DEMO_CLIENT,
  DEMO_CONSULTANT,
  DEMO_IDS,
  DEMO_INTERNAL_NOTES,
  DEMO_SESSION_TITLE,
} from "../src/lib/demo/demo-call";
import { ASSESSMENT_SEGMENTS, DEMO_ASSESSMENT_ID, DEMO_ASSESSMENT_TITLE } from "../src/lib/demo/assessment-call";
import { createDefaultQuestions } from "../src/server/questions";
import { demoTranscript, replaceTranscript } from "../src/server/sessions";

async function main() {
  // Idempotent: wipe and recreate only the demo records.
  await prisma.session.deleteMany({ where: { id: DEMO_IDS.session } });
  await prisma.session.deleteMany({ where: { id: DEMO_ASSESSMENT_ID } });
  await prisma.client.deleteMany({ where: { id: DEMO_IDS.client } });
  await prisma.consultant.deleteMany({ where: { id: DEMO_IDS.consultant } });

  await prisma.consultant.create({ data: { id: DEMO_IDS.consultant, ...DEMO_CONSULTANT } });
  await prisma.client.create({ data: { id: DEMO_IDS.client, consultantId: DEMO_IDS.consultant, ...DEMO_CLIENT } });
  await prisma.session.create({
    data: {
      id: DEMO_IDS.session,
      consultantId: DEMO_IDS.consultant,
      clientId: DEMO_IDS.client,
      type: "DISCOVERY",
      title: DEMO_SESSION_TITLE,
      internalNotes: DEMO_INTERNAL_NOTES,
    },
  });
  await createDefaultQuestions(DEMO_IDS.session);
  await replaceTranscript(DEMO_IDS.session, demoTranscript());
  // The transcript is staged, not started: the call only goes LIVE when the consultant opens it.
  await prisma.session.update({ where: { id: DEMO_IDS.session }, data: { status: "SETUP", startedAt: null } });

  // A second staged call: the assessment follow-up, so assessment mode can be tried straight away.
  await prisma.session.create({
    data: {
      id: DEMO_ASSESSMENT_ID,
      consultantId: DEMO_IDS.consultant,
      clientId: DEMO_IDS.client,
      type: "COMBINED_ASSESSMENT",
      title: DEMO_ASSESSMENT_TITLE,
    },
  });
  await createDefaultQuestions(DEMO_ASSESSMENT_ID, "COMBINED_ASSESSMENT");
  await replaceTranscript(
    DEMO_ASSESSMENT_ID,
    ASSESSMENT_SEGMENTS.map((s) => ({ speaker: s.speaker, text: s.text })),
  );
  await prisma.session.update({ where: { id: DEMO_ASSESSMENT_ID }, data: { status: "SETUP", startedAt: null } });

  const segments = await prisma.transcriptSegment.count({ where: { sessionId: DEMO_IDS.session } });
  console.log(`Seeded demo consultant, client and session "${DEMO_IDS.session}" with ${segments} transcript segments.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
