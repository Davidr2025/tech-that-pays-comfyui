/**
 * Read path for the client-facing prototype dashboard.
 *
 * Like src/server/reveal.ts, it touches only client-safe storage: the validated Report.revealData
 * (for the branded header and tool list) and the PrototypeModule rows, each re-validated against
 * its strict module schema. tests/prototype-privacy.test.tsx enforces that this file and the
 * prototype route never reference the private Session fields.
 */
import { prisma } from "../lib/db";
import { parseModule, type PrototypeModuleView } from "../lib/prototype/schema";
import { revealSchema, type RevealData } from "../lib/reveal/schema";

export interface PrototypePayload {
  kind: RevealData["kind"];
  header: RevealData["header"];
  tools: string[];
  modules: PrototypeModuleView[];
}

export async function getPrototype(sessionId: string): Promise<PrototypePayload | null> {
  const [report, rows] = await Promise.all([
    prisma.report.findUnique({ where: { sessionId }, select: { revealData: true } }),
    prisma.prototypeModule.findMany({ where: { sessionId }, orderBy: { order: "asc" } }),
  ]);
  if (!report || rows.length === 0) return null;
  const reveal = revealSchema.parse(report.revealData);
  const modules: PrototypeModuleView[] = [];
  for (const row of rows) {
    const parsed = parseModule(row.moduleType, row.data); // throws on a known type with extra/invalid fields
    if (parsed) modules.push({ id: row.id, title: row.title, module: parsed });
  }
  if (modules.length === 0) return null;
  return { kind: reveal.kind, header: reveal.header, tools: reveal.techStack.map((t) => t.tool), modules };
}
