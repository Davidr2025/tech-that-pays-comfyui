/**
 * Read path for the client-facing reveal.
 *
 * This module is the ONLY data access the reveal route is allowed. It reads one column of
 * one table (Report.revealData) and re-validates it against the strict allow-list schema,
 * so even a corrupted or hand-edited row cannot carry a private field to the client.
 * tests/privacy.test.ts enforces that this file and the reveal route never reference the
 * private Session fields.
 */
import { prisma } from "../lib/db";
import { revealSchema, type RevealData } from "../lib/reveal/schema";

export async function getRevealPayload(sessionId: string): Promise<RevealData | null> {
  const row = await prisma.report.findUnique({ where: { sessionId }, select: { revealData: true } });
  if (!row) return null;
  return revealSchema.parse(row.revealData);
}
