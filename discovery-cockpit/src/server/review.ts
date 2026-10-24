/**
 * "Build Client Review": the single place where private analysis and the client-safe
 * report are produced together — and where they are split.
 *
 *   private  -> Session.coaching / Session.decisionReadiness / Extraction rows
 *   public   -> Report.revealData (allow-listed, schema-validated)
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/db";
import { analyze } from "../lib/mock-ai/engine";
import type { Analysis, Cue } from "../lib/mock-ai/types";
import { generatePrototype } from "../lib/prototype/generate";
import { buildRevealData } from "../lib/reveal/build";
import { isAssessment, type SessionType } from "../lib/session-types";
import { assertTransition, type SessionStatus } from "../lib/sessions";
import { parseBrandColors } from "./clients";

export class ReviewError extends Error {
  constructor(
    public code: "NOT_FOUND" | "NO_TRANSCRIPT" | "CONFLICT",
    message: string,
  ) {
    super(message);
  }
}

function extractionRows(sessionId: string, a: Analysis): Prisma.ExtractionCreateManyInput[] {
  return [
    ...a.painPoints.map((p) => ({
      sessionId,
      kind: "PAIN_POINT" as const,
      label: p.title,
      detail: p.impact,
      quote: p.quote,
      severity: p.severity,
      segmentOrder: p.segmentOrder,
    })),
    ...a.money.map((m) => ({
      sessionId,
      kind: "DOLLAR" as const,
      label: `$${m.amount}`,
      detail: m.period,
      quote: m.context,
      amountCents: Math.round(m.amount * 100),
      segmentOrder: m.segmentOrder,
    })),
    ...a.tech.map((t) => ({
      sessionId,
      kind: "TECH_STACK" as const,
      label: t.tool,
      detail: t.purpose,
      amountCents: t.monthlyCost === null ? null : Math.round(t.monthlyCost * 100),
      segmentOrder: t.segmentOrder,
    })),
    ...a.signals.map((s) => ({ sessionId, kind: "SIGNAL" as const, label: s.kind, quote: s.quote, segmentOrder: s.segmentOrder })),
    ...([a.facts.budget, a.facts.urgency, a.facts.decision].filter((c) => c !== null) as Cue[]).map((c) => ({
      sessionId,
      kind: "SIGNAL" as const,
      label: c.kind,
      quote: c.quote,
      segmentOrder: c.segmentOrder,
    })),
    ...a.objections.map((o) => ({ sessionId, kind: "OBJECTION" as const, label: o.kind, quote: o.quote, segmentOrder: o.segmentOrder })),
  ];
}

export async function buildClientReview(sessionId: string, opts: { upTo?: number } = {}) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      consultant: true,
      client: true,
      segments: { orderBy: { order: "asc" } },
      questions: true,
    },
  });
  if (!session) throw new ReviewError("NOT_FOUND", "Session not found.");

  const segments = session.segments
    .slice(0, opts.upTo ?? undefined)
    .map((s) => ({ speaker: s.speaker, text: s.text, order: s.order }));
  if (segments.length === 0) throw new ReviewError("NO_TRANSCRIPT", "Play or paste a transcript before building the review.");

  try {
    assertTransition(session.status as SessionStatus, "REVIEW");
  } catch (err) {
    throw new ReviewError("CONFLICT", err instanceof Error ? err.message : "This session cannot be reviewed.");
  }

  const type = session.type as SessionType;
  const analysis = analyze(segments, { type });
  const generatedAt = new Date();
  const clientBrand = session.brandingMode === "CLIENT" ? parseBrandColors(session.client.brandColors) : null;
  const branding = clientBrand
    ? { primaryColor: clientBrand.primary, accentColor: clientBrand.accent ?? session.consultant.accentColor, logoUrl: null }
    : { primaryColor: session.consultant.primaryColor, accentColor: session.consultant.accentColor, logoUrl: session.consultant.logoUrl };
  const revealData = buildRevealData({
    consultant: session.consultant,
    branding,
    client: session.client,
    analysis,
    generatedAt,
    kind: type,
  });
  const prototype = isAssessment(type)
    ? generatePrototype({ analysis, company: session.client.companyName, industry: session.client.industry })
    : [];

  const covered = new Set(analysis.topicsCovered);
  const privateCoaching = {
    builtFromSegments: segments.length,
    readiness: analysis.readiness,
    reflectBack: analysis.reflectBack,
    nextQuestion: analysis.nextQuestion,
    painSeverity: analysis.painPoints.map((p) => ({ id: p.id, severity: p.severity })),
    signals: analysis.signals,
    objections: analysis.objections,
    facts: analysis.facts,
    followUp: analysis.followUp,
    talk: analysis.talk,
  };

  await prisma.$transaction([
    prisma.extraction.deleteMany({ where: { sessionId } }),
    prisma.extraction.createMany({ data: extractionRows(sessionId, analysis) }),
    prisma.session.update({
      where: { id: sessionId },
      data: { decisionReadiness: analysis.readiness.score, coaching: privateCoaching as unknown as Prisma.InputJsonValue, status: "REVIEW" },
    }),
    ...session.questions.map((q) => {
      const manual = q.isCovered && !q.coveredByAI;
      const ai = covered.has(q.topic);
      return prisma.question.update({
        where: { id: q.id },
        data: { isCovered: manual || ai, coveredByAI: !manual && ai },
      });
    }),
    prisma.report.upsert({
      where: { sessionId },
      create: { sessionId, revealData },
      update: { revealData },
    }),
    prisma.prototypeModule.deleteMany({ where: { sessionId } }),
    prisma.prototypeModule.createMany({
      data: prototype.map((m) => ({ sessionId, moduleType: m.moduleType, title: m.title, order: m.order, data: m.data as Prisma.InputJsonValue })),
    }),
  ]);

  return { revealPath: `/reveal/${sessionId}`, prototypePath: prototype.length ? `/prototype/${sessionId}` : null, analysis };
}
