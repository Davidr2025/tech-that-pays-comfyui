/**
 * Live analysis for the cockpit when the consultant has chosen Claude.
 *
 * The browser asks "analyse the call up to line N". The server keeps what Claude has found so far on the session
 * (`liveState`, `liveSeen`), sends only lines it has not seen, and answers with the same `Analysis` the in-browser
 * rules would have produced. If Claude cannot answer, the answer is the rule-based one, flagged `fellBack`, and
 * nothing advances, so the next call tries again with the same lines.
 */
import { Prisma } from "@prisma/client";
import type { Analysis, Segment } from "../../lib/mock-ai/types";
import { prisma } from "../../lib/db";
import { mockProvider } from "../../lib/ai/mock-provider";
import { stateSchema, type AnalysisState } from "../../lib/ai/schemas";
import type { ProviderId } from "../../lib/ai/types";
import type { SessionType } from "../../lib/session-types";
import { resolveProvider } from "./provider";

export interface LiveAnswer {
  analysis: Analysis;
  provider: ProviderId;
  fellBack: boolean;
  /** How many lines the answer covers. */
  upTo: number;
}

/** After a failed call, answer from the rules for this long instead of asking again on every new line. */
const COOLDOWN_MS = 20_000;
const cooldown = new Map<string, number>();
/** One analysis at a time per session, so two overlapping requests cannot both send the same lines. */
const queues = new Map<string, Promise<unknown>>();

export function resetLiveMemory() {
  cooldown.clear();
  queues.clear();
}

function serial<T>(key: string, job: () => Promise<T>): Promise<T> {
  const run = (queues.get(key) ?? Promise.resolve()).catch(() => undefined).then(job);
  queues.set(key, run);
  void run.finally(() => {
    if (queues.get(key) === run) queues.delete(key);
  }).catch(() => undefined);
  return run;
}

export function liveAnalysis(args: { sessionId: string; consultant: { id: string; aiProvider: string }; upTo: number; reset: boolean }): Promise<LiveAnswer | null> {
  return serial(args.sessionId, () => run(args));
}

async function run({ sessionId, consultant, upTo, reset }: { sessionId: string; consultant: { id: string; aiProvider: string }; upTo: number; reset: boolean }): Promise<LiveAnswer | null> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      type: true,
      liveState: true,
      liveSeen: true,
      segments: { orderBy: { order: "asc" }, select: { speaker: true, text: true, order: true } },
      questions: { orderBy: { order: "asc" }, select: { topic: true, text: true } },
    },
  });
  if (!session) return null;

  const all: Segment[] = session.segments;
  const segments = all.slice(0, Math.max(0, Math.min(upTo, all.length)));
  const type = session.type as SessionType;
  const provider = resolveProvider(consultant);

  if (provider.id === "mock") {
    const result = await mockProvider.analyzeTranscript({ type, questions: session.questions, segments, seen: 0, state: null });
    return { analysis: result.analysis, provider: "mock", fellBack: false, upTo: segments.length };
  }

  const stored = stateSchema.safeParse(session.liveState);
  let state: AnalysisState | null = stored.success ? stored.data : null;
  let seen = stored.success ? session.liveSeen : 0;
  // Going backwards (the demo restarted) or a state we cannot read: begin again from the first line.
  if (reset || seen > segments.length) {
    state = null;
    seen = 0;
  }

  if ((cooldown.get(sessionId) ?? 0) > Date.now()) {
    const result = await mockProvider.analyzeTranscript({ type, questions: session.questions, segments, seen: 0, state: null });
    return { analysis: result.analysis, provider: "mock", fellBack: true, upTo: segments.length };
  }

  const result = await provider.analyzeTranscript({ type, questions: session.questions, segments, seen, state });
  if (result.fellBack) {
    cooldown.set(sessionId, Date.now() + COOLDOWN_MS);
    return { analysis: result.analysis, provider: "mock", fellBack: true, upTo: segments.length };
  }

  cooldown.delete(sessionId);
  await prisma.session.update({
    where: { id: sessionId },
    data: { liveState: (result.state ?? Prisma.DbNull) as Prisma.InputJsonValue, liveSeen: result.seen, liveProvider: "claude" },
  });
  return { analysis: result.analysis, provider: "claude", fellBack: false, upTo: segments.length };
}
