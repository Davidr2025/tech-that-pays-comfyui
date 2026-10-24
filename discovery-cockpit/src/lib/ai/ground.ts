/**
 * Turns the model's answer into the app's own `Analysis`, trusting it for judgment only.
 *
 * The model decides WHICH problem a client sentence describes, how serious it is, which sentence carries a
 * figure, which tool a cost belongs to, what was covered, and what to ask next. It never supplies a number the
 * client sees: every quote must be a sentence the CLIENT actually said, and every hour or dollar figure is read
 * out of that sentence by the same parsers the rule-based engine uses. Anything that cannot be found in the
 * transcript is dropped (and counted), never repaired.
 */
import { extractAssessment } from "../mock-ai/assessment";
import { bankFor } from "../mock-ai/banks";
import { describeImpact, costFromSentence, extractTimeline, pickNextQuestion, splitSentences, talkRatio } from "../mock-ai/engine";
import { findMoney } from "../mock-ai/money";
import { PAIN_CATEGORIES } from "../mock-ai/pain";
import { parseTime } from "../mock-ai/quantities";
import { TOOL_CATALOG } from "../mock-ai/tools";
import type { Analysis, Cue, MoneyMention, PainPoint, Segment, Severity } from "../mock-ai/types";
import type { SessionType } from "../session-types";
import { emptyState, type AnalysisState, type Delta } from "./schemas";

/** How much earlier conversation rides along with new segments, for reading context only. */
export const CONTEXT_SEGMENTS = 6;
/** The most new segments one call carries; a longer backlog is worked through in several calls. */
export const MAX_NEW_SEGMENTS = 40;
/** Longest segment text sent to the model. */
export const MAX_SENT_CHARS = 1500;

const SEVERITY_RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1 };

/** Lower-case words and digits only, so punctuation or smart quotes in a quote do not break the match. Apostrophes vanish ("it's" and "its" match). */
export function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKC")
    .replace(/['’‘`]/g, "")
    .replace(/[^\p{L}\p{N}$%]+/gu, " ")
    .trim();
}

interface Located {
  order: number;
  /** The client's own sentence that contains the quote. */
  sentence: string;
}

/** Finds the CLIENT sentence containing `quote`; null when the client never said it (or only the consultant did). */
export function locate(quote: string, segments: Segment[]): Located | null {
  const want = normalise(quote);
  if (want.length < 8) return null;
  for (const seg of segments) {
    if (seg.speaker !== "CLIENT") continue;
    for (const sentence of splitSentences(seg.text)) {
      if (normalise(sentence).includes(want)) return { order: seg.order, sentence };
    }
  }
  return null;
}

/** First client segment in which `tool` is mentioned, or null. */
function firstMention(tool: string, segments: Segment[]): number | null {
  const want = normalise(tool);
  if (want.length < 2) return null;
  const padded = ` ${want} `;
  for (const seg of segments) {
    if (seg.speaker === "CLIENT" && ` ${normalise(seg.text)} `.includes(padded)) return seg.order;
  }
  return null;
}

const cueFrom = (kind: string, found: Located): Cue => ({ kind, quote: found.sentence, segmentOrder: found.order });

function addCue(list: Cue[], cue: Cue, cap: number) {
  if (list.length < cap && !list.some((c) => c.quote === cue.quote && c.kind === cue.kind)) list.push(cue);
}

export interface Applied {
  state: AnalysisState;
  /** Items in the answer that the transcript did not support, and so were not used. */
  dropped: number;
}

/** Folds one model answer into the accumulated findings. Pure: neither input is modified. */
export function applyDelta(prev: AnalysisState | null, delta: Delta, segments: Segment[], allowedTopics: ReadonlySet<string>): Applied {
  const state: AnalysisState = structuredClone(prev ?? emptyState());
  let dropped = 0;

  for (const p of delta.painPoints) {
    const where = locate(p.quote, segments);
    if (!where) {
      dropped++;
      continue;
    }
    let figure: Located | null = null;
    if (p.figureQuote) {
      figure = locate(p.figureQuote, segments);
      if (!figure) dropped++; // the problem stands; the unsupported figure does not
    }
    const have = state.pains.find((x) => x.id === p.category);
    if (have) {
      if (SEVERITY_RANK[p.severity] > SEVERITY_RANK[have.severity]) have.severity = p.severity;
      have.mentions += 1;
      if (!have.figureQuote && figure) have.figureQuote = figure.sentence;
    } else {
      state.pains.push({ id: p.category, quote: where.sentence, order: where.order, severity: p.severity, mentions: 1, figureQuote: figure?.sentence ?? null });
    }
  }

  for (const [list, items] of [
    [state.signals, delta.signals],
    [state.objections, delta.objections],
  ] as const) {
    for (const c of items) {
      const where = locate(c.quote, segments);
      if (where) addCue(list, cueFrom(c.kind, where), 30);
      else dropped++;
    }
  }

  for (const t of delta.techStack) {
    const order = firstMention(t.tool, segments);
    if (order === null) {
      dropped++;
      continue;
    }
    const known = TOOL_CATALOG.find((d) => d.pattern.test(t.tool));
    const name = known?.name ?? t.tool;
    let row = state.tech.find((x) => x.tool.toLowerCase() === name.toLowerCase());
    if (!row) {
      if (state.tech.length >= 25) continue;
      row = { tool: name, purpose: known?.purpose ?? t.purpose, monthlyCost: null, annualCost: null, note: null, order };
      state.tech.push(row);
    }
    if (t.costQuote && row.monthlyCost === null) {
      const where = locate(t.costQuote, segments);
      const cost = where ? costFromSentence(name, where.sentence) : null;
      if (cost) Object.assign(row, { monthlyCost: cost.monthly, annualCost: cost.annual, note: cost.note });
      else dropped++;
    }
  }

  const f = delta.facts;
  const budget = f.budgetQuote ? locate(f.budgetQuote, segments) : null;
  const urgency = f.urgencyQuote ? locate(f.urgencyQuote, segments) : null;
  const decision = f.decisionQuote && f.decisionRole ? locate(f.decisionQuote, segments) : null;
  dropped += [f.budgetQuote && !budget, f.urgencyQuote && !urgency, f.decisionQuote && f.decisionRole && !decision].filter(Boolean).length;
  if (budget && !state.facts.budget) state.facts.budget = cueFrom("Budget", budget);
  if (urgency && !state.facts.urgency) state.facts.urgency = cueFrom("Urgency", urgency);
  if (decision && f.decisionRole && (!state.facts.decision || (state.facts.decision.role === "shared" && f.decisionRole === "maker"))) {
    state.facts.decision = { ...cueFrom(f.decisionRole === "maker" ? "Decision-maker" : "Shared decision", decision), role: f.decisionRole };
  }

  for (const topic of delta.questionsCovered) {
    if (!allowedTopics.has(topic)) dropped++;
    else if (!state.covered.includes(topic)) state.covered.push(topic);
  }

  state.readiness = { score: delta.decisionReadiness.score, reason: delta.decisionReadiness.reason };
  state.reflectBack = delta.reflectBackSummary;
  state.followUp = { text: delta.suggestedNextQuestion.text, why: delta.suggestedNextQuestion.why };
  return { state, dropped };
}

/** The app's analysis, assembled from grounded findings. Everything numeric is derived from client sentences here. */
export function toAnalysis(state: AnalysisState, segments: Segment[], type: SessionType): Analysis {
  const bank = bankFor(type);
  const ordered = [...segments].sort((a, b) => a.order - b.order);
  const clientSentences = ordered.filter((s) => s.speaker === "CLIENT").flatMap((s) => splitSentences(s.text).map((text) => ({ text, order: s.order })));

  const painPoints: PainPoint[] = state.pains
    .map((p, index) => ({ p, index, cat: PAIN_CATEGORIES.find((c) => c.id === p.id) }))
    .filter((x): x is typeof x & { cat: NonNullable<typeof x.cat> } => x.cat !== undefined)
    .sort((a, b) => SEVERITY_RANK[b.p.severity] - SEVERITY_RANK[a.p.severity] || b.p.mentions - a.p.mentions || a.index - b.index)
    .map(({ p, cat }) => {
      const sentence = p.figureQuote;
      const time = sentence && cat.timeSink ? parseTime(sentence) : null;
      const impact = describeImpact(cat, sentence ? [{ time, count: null, money: findMoney(sentence), intense: false, visible: false }] : []);
      return {
        id: cat.id,
        title: cat.title,
        description: cat.description,
        impact: impact.text,
        quantified: impact.quantified,
        weeklyHours: impact.weeklyHours,
        hoursSource: impact.hoursSource,
        annualAmount: impact.annualAmount,
        severity: p.severity,
        quote: p.quote,
        segmentOrder: p.order,
        currentState: cat.currentState,
        futureState: cat.futureState,
      };
    });

  const money: MoneyMention[] = clientSentences.flatMap(({ text, order }) =>
    findMoney(text).map((m) => ({ amount: m.amount, period: m.period, context: text, segmentOrder: order })),
  );
  const tech = state.tech.map((t) => ({ tool: t.tool, purpose: t.purpose, monthlyCost: t.monthlyCost, annualCost: t.annualCost, note: t.note, segmentOrder: t.order }));
  const facts = { budget: state.facts.budget, urgency: state.facts.urgency, decision: state.facts.decision };
  const followUp = state.followUp ? { topic: null, text: state.followUp.text, why: state.followUp.why } : null;
  const score = state.readiness?.score ?? 0;

  return {
    painPoints,
    money,
    tech,
    signals: state.signals,
    objections: state.objections,
    facts,
    timeline: extractTimeline(state.facts.urgency),
    topicsCovered: state.covered,
    assessment: extractAssessment(clientSentences, tech.map((t) => t.tool)),
    talk: talkRatio(ordered),
    readiness: {
      score,
      tier: score >= 65 ? "ready" : score >= 35 ? "warming" : "early",
      reason: state.readiness?.reason ?? "Nothing heard yet — listen for budget, timeline and who decides.",
      // The score is the model's judgment, not a sum of parts: no breakdown is shown for it.
      factors: [],
    },
    reflectBack: state.reflectBack || "Keep listening — no clear problem stated yet. Ask them to walk you through how it works today.",
    followUp,
    nextQuestion: pickNextQuestion(new Set(state.covered), followUp, bank),
  };
}
