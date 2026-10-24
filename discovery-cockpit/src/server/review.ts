/**
 * "Build Client Review": the single place where private analysis and the client-safe
 * report are produced together — and where they are split.
 *
 *   private  -> Session.coaching / Session.decisionReadiness / Extraction rows
 *   public   -> Report.revealData (allow-listed, schema-validated)
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/db";
import { stateSchema, type AnalysisState } from "../lib/ai/schemas";
import type { Provenance } from "../lib/ai/types";
import type { Analysis, Cue } from "../lib/mock-ai/types";
import { isAssessment, type SessionType } from "../lib/session-types";
import { assertTransition, type SessionStatus } from "../lib/sessions";
import { resolveProvider } from "./ai/provider";
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
  const provider = resolveProvider(session.consultant);

  // A Claude analysis picks up where the live call left off: only lines it has not seen are sent.
  const stored = stateSchema.safeParse(session.liveState);
  const resume: { state: AnalysisState | null; seen: number } = stored.success && session.liveSeen <= segments.length ? { state: stored.data, seen: session.liveSeen } : { state: null, seen: 0 };
  const analyzed = await provider.analyzeTranscript({ type, questions: session.questions.map((q) => ({ topic: q.topic, text: q.text })), segments, ...resume });
  const analysis = analyzed.analysis;

  const generatedAt = new Date();
  const clientBrand = session.brandingMode === "CLIENT" ? parseBrandColors(session.client.brandColors) : null;
  const branding = clientBrand
    ? { primaryColor: clientBrand.primary, accentColor: clientBrand.accent ?? session.consultant.accentColor, logoUrl: null }
    : { primaryColor: session.consultant.primaryColor, accentColor: session.consultant.accentColor, logoUrl: session.consultant.logoUrl };
  const reveal = await provider.generateReveal({
    consultant: session.consultant,
    branding,
    client: session.client,
    analysis,
    generatedAt,
    kind: type,
    hourlyValue: session.client.hourlyValue,
    bookingUrl: session.client.calendarLink ?? session.consultant.calendarLink,
    embedBooking: session.consultant.embedBooking,
  });
  const revealData = reveal.value;
  const protoResult = isAssessment(type) ? await provider.generatePrototype({ analysis, company: session.client.companyName, industry: session.client.industry }) : null;
  const prototype = protoResult?.value ?? [];
  const provenance: Record<"analysis" | "reveal" | "prototype", Provenance | null> = {
    analysis: { provider: analyzed.provider, fellBack: analyzed.fellBack },
    reveal: { provider: reveal.provider, fellBack: reveal.fellBack },
    prototype: protoResult ? { provider: protoResult.provider, fellBack: protoResult.fellBack } : null,
  };

  const covered = new Set(analysis.topicsCovered);
  const privateCoaching = {
    builtFromSegments: segments.length,
    provenance,
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
      data: {
        decisionReadiness: analysis.readiness.score,
        coaching: privateCoaching as unknown as Prisma.InputJsonValue,
        status: "REVIEW",
        // Keep what a paid analysis learned, so the next build (or more lines) continues from here.
        ...(analyzed.provider === "claude" && !analyzed.fellBack && analyzed.state
          ? { liveState: analyzed.state as unknown as Prisma.InputJsonValue, liveSeen: analyzed.seen, liveProvider: "claude" }
          : {}),
      },
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

  return { revealPath: `/reveal/${sessionId}`, prototypePath: prototype.length ? `/prototype/${sessionId}` : null, analysis, provenance };
}
