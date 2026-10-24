import { prisma } from "../src/lib/db";
import {
  DEMO_CLIENT,
  DEMO_CONSULTANT,
  DEMO_IDS,
  DEMO_INTERNAL_NOTES,
  DEMO_SESSION_TITLE,
} from "../src/lib/demo/demo-call";
import { createDefaultQuestions } from "../src/server/questions";
import { demoTranscript, replaceTranscript } from "../src/server/sessions";

async function main() {
  // Idempotent: wipe and recreate only the demo records.
  await prisma.session.deleteMany({ where: { id: DEMO_IDS.session } });
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

  const segments = await prisma.transcriptSegment.count({ where: { sessionId: DEMO_IDS.session } });
  console.log(`Seeded demo consultant, client and session "${DEMO_IDS.session}" with ${segments} transcript segments.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
