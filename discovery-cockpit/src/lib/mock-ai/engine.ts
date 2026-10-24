/**
 * MockAIEngine — a deterministic, rule-based stand-in for an LLM.
 *
 * Pure function over the transcript: keyword/regex rules, a dollar regex and tool-name
 * matching. No network, no randomness, no I/O. The cockpit runs it in the browser on the
 * transcript-so-far; the server runs the same code when building the client review.
 *
 * Only CLIENT sentences are mined for pain points, money, tools, signals and objections —
 * the consultant's own words (including any prices they quote) never become findings.
 */
import { joinList } from "../format";
import {
  BUDGET_FACT,
  DEADLINE_PHRASE,
  DECISION_MAKER,
  DECISION_SHARED,
  ONE_TIME_CUE,
  OBJECTION_RULES,
  RECURRING_CUE,
  SIGNAL_RULES,
  URGENCY_FACT,
  WINDOW_PHRASE,
} from "./cues";
import { annualised, findMoney, formatDollars, type RawMoney } from "./money";
import { formatRange } from "./numbers";
import { parseCount, parseTime, type CountQty, type TimeQty } from "./quantities";
import { CUSTOMER_VISIBLE, INTENSITY, PAIN_CATEGORIES, type PainCategory } from "./pain";
import { extractAssessment } from "./assessment";
import { bankFor } from "./banks";
import { TOPIC_DETECTORS, type Ctx } from "./detectors";
import { QUESTION_BANK, type BankQuestion } from "./questions";
import { TOOL_CATALOG } from "./tools";
import type { SessionType } from "../session-types";
import type { AssessmentFacts } from "./assessment";
import type {
  Analysis,
  Cue,
  DecisionFacts,
  MoneyMention,
  NextQuestion,
  PainPoint,
  Period,
  Readiness,
  ReadinessFactor,
  Segment,
  Severity,
  TalkRatio,
  TechItem,
  Timeline,
} from "./types";

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+(?=[A-Z"'“(\$0-9])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export { findMoney } from "./money";

const singular = (noun: string) => (noun.endsWith("ies") ? `${noun.slice(0, -3)}y` : noun.replace(/s$/, ""));

// ---------- pain points ----------

interface Features {
  time: TimeQty | null;
  count: CountQty | null;
  money: RawMoney[];
  intense: boolean;
  visible: boolean;
}

interface Evidence {
  hits: { sentence: string; order: number }[];
  features: Features[];
}

function featuresOf(sentence: string): Features {
  return {
    time: parseTime(sentence),
    count: parseCount(sentence),
    money: findMoney(sentence),
    intense: INTENSITY.test(sentence),
    visible: CUSTOMER_VISIBLE.test(sentence),
  };
}

const hasFeatures = (f: Features) => f.time || f.count || f.money.length || f.intense || f.visible;

/** Wording that frames a dollar figure as money lost or spent because of a problem. */
const LOSS_CUE = /\b(on the table|leaving|lost|losing|costs? (me|us)|costing|extra|wasted?|wasting|saving)\b/i;

const SEVERITY_RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1 };

function severityFor(score: number): Severity {
  if (score >= 6) return "high";
  if (score >= 3) return "medium";
  return "low";
}

/**
 * Walks each client segment sentence by sentence. A sentence that matches a pain category is
 * a "hit". A follow-on sentence that matches nothing ("That was embarrassing.", "That's an extra
 * $150,000 a year on the table.") lends its intensity, numbers and money to the category the
 * previous matching sentence in the same segment belonged to. Hours only count toward
 * time-sink categories.
 */
function collectEvidence(clientSegments: Segment[]): Map<string, Evidence> {
  const evidence = new Map<string, Evidence>();
  const slot = (id: string) => {
    let e = evidence.get(id);
    if (!e) evidence.set(id, (e = { hits: [], features: [] }));
    return e;
  };
  const byId = new Map(PAIN_CATEGORIES.map((c) => [c.id, c]));
  const forCategory = (cat: PainCategory, f: Features): Features => ({ ...f, time: cat.timeSink ? f.time : null });

  for (const seg of clientSegments) {
    let lastMatched: PainCategory[] = [];
    for (const sentence of splitSentences(seg.text)) {
      const matched = PAIN_CATEGORIES.filter((c) => c.pattern.test(sentence));
      const f = featuresOf(sentence);
      if (matched.length) {
        for (const cat of matched) {
          const e = slot(cat.id);
          e.hits.push({ sentence, order: seg.order });
          e.features.push(forCategory(cat, f));
        }
        // "It's easily ten to twelve hours a week" quantifies the time sink just described.
        if (f.time && !matched.some((c) => c.timeSink)) {
          for (const cat of lastMatched.filter((c) => c.timeSink)) slot(cat.id).features.push({ ...f, count: null, money: [], intense: false, visible: false });
        }
        lastMatched = matched;
      } else if (lastMatched.length && hasFeatures(f)) {
        // A dollar figure only belongs to the problem it follows when it is framed as a cost or a
        // loss ("an extra $150,000 on the table"); "our revenue is $95,000 a month" is just context.
        const lent: Features = LOSS_CUE.test(sentence) ? f : { ...f, money: [] };
        if (hasFeatures(lent)) for (const cat of lastMatched) slot(cat.id).features.push(forCategory(byId.get(cat.id)!, lent));
      }
    }
  }
  return evidence;
}

function describeImpact(cat: PainCategory, features: Features[]): { text: string | null; quantified: boolean; topWeekly: number; weeklyHours: number | null; hoursSource: string | null; annualAmount: number | null } {
  const times = features.map((f) => f.time).filter((t): t is TimeQty => t !== null);
  const counts = features.map((f) => f.count).filter((c): c is CountQty => c !== null);
  const moneys = features.flatMap((f) => f.money);
  const topWeekly = Math.max(0, ...times.map((t) => t.weekly ?? 0));

  // Prefer an explicit hours figure over a days figure; otherwise the largest.
  const bestTime =
    times.filter((t) => t.unit === "hours").sort((a, b) => (b.high ?? b.low) - (a.high ?? a.low))[0] ??
    times.sort((a, b) => (b.weekly ?? 0) - (a.weekly ?? 0))[0];
  const timeText = bestTime
    ? `about ${formatRange(bestTime.low, bestTime.high)} ${bestTime.unit}${bestTime.per ? ` per ${bestTime.per}` : ""}`
    : null;

  const bestCount = counts[0];
  const countText = bestCount ? `about ${formatRange(bestCount.low, bestCount.high)} ${bestCount.noun} per ${bestCount.per}` : null;

  // Annual figures read best; fall back to whatever was said.
  const bestMoney = [...moneys].sort((a, b) => annualised(b) - annualised(a) || (a.period === "year" ? -1 : 1))[0];
  const moneyText = bestMoney
    ? `about ${formatDollars(bestMoney.amount)}${bestMoney.period !== "unspecified" ? ` per ${bestMoney.period}` : ""}`
    : null;

  const text = cat.timeSink ? (timeText ?? countText ?? (cat.money ? moneyText : null)) : cat.money ? (moneyText ?? countText) : countText;
  return {
    text,
    quantified: Boolean(timeText || countText || moneyText),
    topWeekly,
    // Only expose a number when it is the one the impact text states.
    weeklyHours: cat.timeSink && bestTime && text === timeText && bestTime.weeklyLow !== null ? Math.round(bestTime.weeklyLow * 10) / 10 : null,
    hoursSource: cat.timeSink && bestTime && text === timeText && bestTime.weeklyLow !== null ? bestTime.source : null,
    annualAmount: text === moneyText && bestMoney ? Math.round(annualised(bestMoney)) : null,
  };
}

function extractPainPoints(clientSegments: Segment[]): PainPoint[] {
  const evidence = collectEvidence(clientSegments);
  const scored: { pain: PainPoint; score: number; index: number }[] = [];

  PAIN_CATEGORIES.forEach((cat, index) => {
    const e = evidence.get(cat.id);
    if (!e?.hits.length) return;
    const impact = describeImpact(cat, e.features);
    let score = Math.min(3, e.hits.length);
    if (e.features.some((f) => f.intense)) score += 2;
    if (e.features.some((f) => f.visible)) score += 2;
    if (impact.topWeekly >= 10) score += 4;
    else if (e.features.some((f) => f.time)) score += 1;
    if (e.features.some((f) => f.count)) score += 1;
    if (e.features.some((f) => f.money.length)) score += 1;
    const first = e.hits[0]!;
    scored.push({
      index,
      score,
      pain: {
        id: cat.id,
        title: cat.title,
        description: cat.description,
        impact: impact.text,
        quantified: impact.quantified,
        weeklyHours: impact.weeklyHours,
        hoursSource: impact.hoursSource,
        annualAmount: impact.annualAmount,
        severity: severityFor(score),
        quote: first.sentence,
        segmentOrder: first.order,
        currentState: cat.currentState,
        futureState: cat.futureState,
      },
    });
  });

  return scored
    .sort((a, b) => SEVERITY_RANK[b.pain.severity] - SEVERITY_RANK[a.pain.severity] || b.score - a.score || a.index - b.index)
    .map((s) => s.pain);
}

// ---------- tech stack ----------

function monthlyFrom(amount: number, period: Period): { monthly: number; annual: number; note: string | null } | null {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  switch (period) {
    case "month":
      return { monthly: amount, annual: r2(amount * 12), note: null };
    case "year":
      return { monthly: r2(amount / 12), annual: amount, note: "billed annually" };
    case "week":
      return { monthly: r2((amount * 52) / 12), annual: r2(amount * 52), note: "billed weekly" };
    default:
      return null;
  }
}

/** Splits a sentence into clauses so "Asana at $120 a month, Zapier at $99 a month" pairs correctly. */
function clausesOf(sentence: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  let start = 0;
  for (const m of sentence.matchAll(/,|;|—|–| - |\band\b/gi)) {
    out.push({ start, end: m.index ?? 0 });
    start = (m.index ?? 0) + m[0].length;
  }
  out.push({ start, end: sentence.length });
  return out;
}

function extractTech(clientSentences: { text: string; order: number }[]): TechItem[] {
  const tools = new Map<string, TechItem>();
  const touch = (name: string, purpose: string, order: number) => {
    if (!tools.has(name)) {
      tools.set(name, { tool: name, purpose, monthlyCost: null, annualCost: null, note: null, segmentOrder: order });
    }
    return tools.get(name)!;
  };

  for (const { text, order } of clientSentences) {
    const mentions: { name: string; purpose: string; index: number }[] = [];
    for (const def of TOOL_CATALOG) {
      const m = text.match(def.pattern);
      if (m && m.index !== undefined) mentions.push({ name: def.name, purpose: def.purpose, index: m.index });
    }
    for (const mention of mentions) touch(mention.name, mention.purpose, order);
    if (!mentions.length) continue;

    const clauses = clausesOf(text);
    for (const money of findMoney(text)) {
      let { period } = money;
      let assumed = false;
      if (period === "unspecified") {
        if (RECURRING_CUE.test(text) && !ONE_TIME_CUE.test(text)) {
          period = "month";
          assumed = true;
        } else continue; // a one-off or unclear amount is not a subscription cost
      }
      const converted = monthlyFrom(money.amount, period);
      if (!converted) continue;

      // Same clause first; otherwise the closest tool before the amount; otherwise the closest after.
      const clause = clauses.find((c) => money.start >= c.start && money.start <= c.end);
      const inClause = clause ? mentions.filter((m) => m.index >= clause.start && m.index <= clause.end) : [];
      const dist = (m: { index: number }) => Math.abs(m.index - money.start);
      const pool = inClause.length ? inClause : mentions.filter((m) => m.index < money.start);
      const candidates = pool.length ? pool : mentions;
      const nearest = candidates.reduce((best, m) => (dist(m) < dist(best) ? m : best));

      const item = touch(nearest.name, nearest.purpose, order);
      item.monthlyCost = converted.monthly;
      item.annualCost = converted.annual;
      item.note = assumed ? "assumed monthly" : converted.note;
    }
  }
  return [...tools.values()];
}

// ---------- cues and facts ----------

function extractCues(rules: { kind: string; pattern: RegExp }[], clientSegments: Segment[]): Cue[] {
  const out: Cue[] = [];
  for (const seg of clientSegments) {
    const seen = new Set<string>(); // one cue per kind per segment
    for (const sentence of splitSentences(seg.text)) {
      const rule = rules.find((r) => r.pattern.test(sentence));
      if (rule && !seen.has(rule.kind)) {
        seen.add(rule.kind);
        out.push({ kind: rule.kind, quote: sentence, segmentOrder: seg.order });
      }
    }
  }
  return out;
}

function firstMatch(kind: string, re: RegExp, clientSentences: { text: string; order: number }[]): Cue | null {
  const hit = clientSentences.find((s) => re.test(s.text));
  return hit ? { kind, quote: hit.text, segmentOrder: hit.order } : null;
}

function extractFacts(clientSentences: { text: string; order: number }[]): DecisionFacts {
  const maker = firstMatch("Decision-maker", DECISION_MAKER, clientSentences);
  const shared = maker ? null : firstMatch("Shared decision", DECISION_SHARED, clientSentences);
  return {
    budget: firstMatch("Budget", BUDGET_FACT, clientSentences),
    urgency: firstMatch("Urgency", URGENCY_FACT, clientSentences),
    decision: maker ? { ...maker, role: "maker" } : shared ? { ...shared, role: "shared" } : null,
  };
}

function extractTimeline(urgency: Cue | null): Timeline {
  if (!urgency) return { deadline: null, window: null };
  return {
    deadline: urgency.quote.match(DEADLINE_PHRASE)?.[1] ?? null,
    window: urgency.quote.match(WINDOW_PHRASE)?.[1] ?? null,
  };
}

// ---------- question coverage ----------

function detectTopics(segments: Segment[], bank: BankQuestion[], painIds: Set<string>, tech: TechItem[], assessment: AssessmentFacts): string[] {
  const test = (list: Segment[]) => (re: RegExp) => list.some((s) => re.test(s.text));
  const consultantSentences = segments.filter((s) => s.speaker === "CONSULTANT").flatMap((s) => splitSentences(s.text));
  const costed = tech.filter((t) => t.monthlyCost !== null).length;
  const ctx: Ctx = {
    any: test(segments),
    client: test(segments.filter((s) => s.speaker === "CLIENT")),
    asks: (re) => consultantSentences.some((s) => s.endsWith("?") && re.test(s)),
    painIds,
    hasCostedTool: costed > 0,
    costedToolCount: costed,
    assessment,
  };
  return bank.filter((q) => TOPIC_DETECTORS[q.topic]?.(ctx)).map((q) => q.topic);
}

/**
 * The single best next question. A contextual follow-up (`followUp`) jumps the queue; the first
 * uncovered bank question, in natural call order, follows it (as `after`) or stands alone.
 */
export function pickNextQuestion(covered: ReadonlySet<string>, followUp: NextQuestion | null = null, bank: BankQuestion[] = QUESTION_BANK): NextQuestion {
  const next = bank.find((q) => !covered.has(q.topic));
  if (followUp) return { ...followUp, after: next?.text ?? null };
  if (!next) {
    return {
      topic: null,
      text: "Recap what you heard and confirm who needs to see the proposal.",
      why: "Every core question is covered — close the loop.",
    };
  }
  return { topic: next.topic, text: next.text, why: next.why };
}

/**
 * A problem the client counted ("three to four good leads a month die") but never priced is
 * missing a dollar value for the reveal. Skipped once the consultant has asked what one is worth.
 */
function dollarizeFollowUp(painPoints: PainPoint[], consultantText: string, counts: Map<string, CountQty>, priced: Set<string>): NextQuestion | null {
  for (const pain of painPoints) {
    const cat = PAIN_CATEGORIES.find((c) => c.id === pain.id);
    if (!cat?.dollarize || !counts.has(pain.id) || priced.has(pain.id)) continue;
    const noun = counts.get(pain.id) ? singular(counts.get(pain.id)!.noun) : cat.dollarize;
    if (new RegExp(`\\b(worth|value)\\b[^.?]{0,40}\\b${noun}\\b|\\b${noun}\\b[^.?]{0,40}\\b(worth|value)\\b`, "i").test(consultantText)) continue;
    return {
      topic: null,
      text: `What is one recovered ${noun} worth to you in revenue?`,
      why: `Puts a dollar value on the ${noun} follow-up fix for the reveal (effectiveness).`,
    };
  }
  return null;
}

// ---------- readiness ----------

function scoreReadiness(args: {
  signals: Cue[];
  objections: Cue[];
  facts: DecisionFacts;
  painPoints: PainPoint[];
  heardAnything: boolean;
}): Readiness {
  const { signals, objections, facts, painPoints } = args;
  const budget = facts.budget !== null;
  // No budget statement, but the client already pays a stated amount to work around the problem.
  const spendOnProblem = !budget && painPoints.some((p) => p.id === "outsourcing_cost" && p.quantified);
  const timeline = facts.urgency !== null;
  const decisionFull = facts.decision?.role === "maker";
  const decisionPartial = facts.decision?.role === "shared";

  const high = painPoints.filter((p) => p.severity === "high").length;
  const medium = painPoints.filter((p) => p.severity === "medium").length;
  const low = painPoints.filter((p) => p.severity === "low").length;
  const costOfInaction = painPoints.some((p) => p.quantified && p.severity !== "low");

  const factors: ReadinessFactor[] = [
    { label: "Budget", points: budget ? 15 : spendOnProblem ? 8 : 0, max: 15 },
    { label: "Urgency", points: timeline ? 20 : 0, max: 20 },
    { label: "Decision-maker", points: decisionFull ? 15 : decisionPartial ? 5 : 0, max: 15 },
    { label: "Pain", points: Math.min(15, high * 6 + medium * 3 + low), max: 15 },
    { label: "Cost of inaction", points: costOfInaction ? 10 : 0, max: 10 },
    { label: "Buying signals", points: Math.min(15, signals.length * 5), max: 15 },
    { label: "Objections", points: -Math.min(16, objections.length * 8), max: 0 },
  ];
  const score = Math.max(0, Math.min(100, factors.reduce((sum, f) => sum + f.points, 0)));

  let reason: string;
  if (!args.heardAnything) {
    reason = "Nothing heard yet — listen for budget, timeline and who decides.";
  } else {
    const confirmed = [
      decisionFull && "decision-maker",
      timeline && "urgency",
      budget && "budget",
      signals.length > 0 && (signals.length === 1 ? "a buying signal" : `${signals.length} buying signals`),
    ].filter(Boolean) as string[];
    const missing = [
      !budget && (spendOnProblem ? "an explicit budget" : "budget"),
      !timeline && "timeline",
      !decisionFull && (decisionPartial ? "final approver" : "who decides"),
    ].filter(Boolean) as string[];
    const parts: string[] = [];
    if (confirmed.length) parts.push(`${joinList(confirmed)} confirmed`);
    if (missing.length) parts.push(`still need ${joinList(missing)}`);
    if (objections.length) parts.push(`${objections.length} open ${objections.length === 1 ? "objection" : "objections"} to address`);
    reason = parts.length ? parts.join("; ") : "No decision signals yet.";
    reason = reason.charAt(0).toUpperCase() + reason.slice(1) + ".";
  }

  return { score, tier: score >= 65 ? "ready" : score >= 35 ? "warming" : "early", reason, factors };
}

// ---------- reflect back ----------

function reflectBack(painPoints: PainPoint[], timeline: Timeline): string {
  if (!painPoints.length) {
    return "Keep listening — no clear problem stated yet. Ask them to walk you through how it works today.";
  }
  const lines = painPoints.slice(0, 3).map((p) => `${p.title.charAt(0).toLowerCase()}${p.title.slice(1)}${p.impact ? ` (${p.impact})` : ""}`);
  let out = `What I'm hearing is ${joinList(lines)}`;
  if (timeline.deadline) out += `, with a target date of ${timeline.deadline}`;
  else if (timeline.window) out += `, and you want to move within ${timeline.window}`;
  return `${out}. Did I get that right, and what am I missing?`;
}

// ---------- talk ratio ----------

export function talkRatio(segments: Segment[]): TalkRatio {
  let consultantWords = 0;
  let clientWords = 0;
  for (const s of segments) {
    if (s.speaker === "CONSULTANT") consultantWords += countWords(s.text);
    else clientWords += countWords(s.text);
  }
  const total = consultantWords + clientWords;
  const consultantPct = total ? Math.round((consultantWords / total) * 100) : 0;
  return { consultantWords, clientWords, consultantPct, clientPct: total ? 100 - consultantPct : 0 };
}

// ---------- main entry ----------

export function analyze(segments: Segment[], opts: { type?: SessionType } = {}): Analysis {
  const bank = bankFor(opts.type ?? "DISCOVERY");
  const ordered = [...segments].sort((a, b) => a.order - b.order);
  const clientSegments = ordered.filter((s) => s.speaker === "CLIENT");
  const clientSentences = clientSegments.flatMap((s) => splitSentences(s.text).map((text) => ({ text, order: s.order })));

  const painPoints = extractPainPoints(clientSegments);
  const tech = extractTech(clientSentences);
  const money: MoneyMention[] = clientSentences.flatMap(({ text, order }) =>
    findMoney(text).map((m) => ({ amount: m.amount, period: m.period, context: text, segmentOrder: order })),
  );
  const signals = extractCues(SIGNAL_RULES, clientSegments);
  const objections = extractCues(OBJECTION_RULES, clientSegments);
  const facts = extractFacts(clientSentences);
  const timeline = extractTimeline(facts.urgency);

  const evidence = collectEvidence(clientSegments);
  const counts = new Map<string, CountQty>();
  const priced = new Set<string>();
  for (const [id, e] of evidence) {
    const count = e.features.map((f) => f.count).find((c): c is CountQty => c !== null);
    if (count) counts.set(id, count);
    if (e.features.some((f) => f.money.length)) priced.add(id);
  }
  const followUp = dollarizeFollowUp(
    painPoints,
    ordered.filter((s) => s.speaker === "CONSULTANT").map((s) => s.text).join(" "),
    counts,
    priced,
  );

  const assessment = extractAssessment(clientSentences, tech.map((t) => t.tool));
  const topicsCovered = detectTopics(ordered, bank, new Set(painPoints.map((p) => p.id)), tech, assessment);
  const readiness = scoreReadiness({ signals, objections, facts, painPoints, heardAnything: ordered.length > 0 });

  return {
    painPoints,
    money,
    tech,
    signals,
    objections,
    facts,
    timeline,
    topicsCovered,
    assessment,
    talk: talkRatio(ordered),
    readiness,
    reflectBack: reflectBack(painPoints, timeline),
    followUp,
    nextQuestion: pickNextQuestion(new Set(topicsCovered), followUp, bank),
  };
}
