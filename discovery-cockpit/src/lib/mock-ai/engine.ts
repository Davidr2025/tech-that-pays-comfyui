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
  BUDGET_CUE,
  DECISION_MAKER,
  DECISION_SHARED,
  ONE_TIME_CUE,
  OBJECTION_RULES,
  RECURRING_CUE,
  SIGNAL_RULES,
} from "./cues";
import { INTENSITY, PAIN_CATEGORIES } from "./pain";
import { QUESTION_BANK } from "./questions";
import { TOOL_CATALOG } from "./tools";
import type {
  Analysis,
  Cue,
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

// ---------- money ----------

interface RawMoney {
  amount: number;
  period: Period;
  start: number;
  end: number;
}

const MONEY_RE = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s?(k|m|thousand|million)?\b/gi;

function periodFromWord(word: string): Period {
  const w = word.toLowerCase();
  if (w.startsWith("mo")) return "month";
  if (w.startsWith("y")) return "year";
  if (w.startsWith("w")) return "week";
  if (w.startsWith("d")) return "day";
  return "hour";
}

function detectPeriod(sentence: string, start: number, end: number): Period {
  const after = sentence.slice(end, end + 40);
  const direct = after.match(/^\s*(?:\/|per|a|an|each|every|for (?:the|this|a|one))\s*(month|mo|year|yr|week|wk|day|hour|hr)\b/i);
  if (direct?.[1]) return periodFromWord(direct[1]);
  const adverb = after.match(/^\s*,?\s*(monthly|annually|yearly|weekly)\b/i);
  if (adverb?.[1]) return adverb[1].toLowerCase() === "monthly" ? "month" : adverb[1].toLowerCase() === "weekly" ? "week" : "year";

  const before = sentence.slice(0, start);
  if (/\b(monthly)\b/i.test(before.slice(-30))) return "month";
  if (/\b(annual|annually|yearly)\b/i.test(before.slice(-30))) return "year";
  if (/\b(over|in|per|each|every)\s+(a|the|one)?\s*year\b/i.test(before)) return "year";
  return "unspecified";
}

export function findMoney(sentence: string): RawMoney[] {
  const out: RawMoney[] = [];
  for (const m of sentence.matchAll(new RegExp(MONEY_RE.source, MONEY_RE.flags))) {
    const whole = (m[1] ?? "0").replace(/,/g, "");
    let amount = Number(`${whole}${m[2] ? `.${m[2]}` : ""}`);
    const suffix = (m[3] ?? "").toLowerCase();
    if (suffix === "k" || suffix === "thousand") amount *= 1_000;
    if (suffix === "m" || suffix === "million") amount *= 1_000_000;
    const start = m.index ?? 0;
    const end = start + m[0].length;
    out.push({ amount: Math.round(amount * 100) / 100, period: detectPeriod(sentence, start, end), start, end });
  }
  return out;
}

// ---------- pain points ----------

interface PainHit {
  sentence: string;
  segmentOrder: number;
  hours: { value: number; per: string | null } | null;
  hasMoney: boolean;
  intense: boolean;
}

const HOURS_RE = /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b(?:\s*(?:a|per|each|every)\s*(week|day|month))?/i;

function severityFor(score: number): Severity {
  if (score >= 5) return "high";
  if (score >= 3) return "medium";
  return "low";
}

const SEVERITY_RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1 };

function extractPainPoints(clientSentences: { text: string; order: number }[]): PainPoint[] {
  const hitsByCategory = new Map<string, PainHit[]>();
  for (const { text, order } of clientSentences) {
    for (const cat of PAIN_CATEGORIES) {
      if (!cat.pattern.test(text)) continue;
      const hoursMatch = text.match(HOURS_RE);
      const hit: PainHit = {
        sentence: text,
        segmentOrder: order,
        hours: hoursMatch ? { value: Number(hoursMatch[1]), per: hoursMatch[2]?.toLowerCase() ?? null } : null,
        hasMoney: findMoney(text).length > 0,
        intense: INTENSITY.test(text),
      };
      const list = hitsByCategory.get(cat.id) ?? [];
      list.push(hit);
      hitsByCategory.set(cat.id, list);
    }
  }

  const scored: { pain: PainPoint; score: number }[] = [];
  for (const cat of PAIN_CATEGORIES) {
    const hits = hitsByCategory.get(cat.id);
    if (!hits?.length) continue;
    const topHours = hits.reduce<PainHit["hours"]>((best, h) => (h.hours && (!best || h.hours.value > best.value) ? h.hours : best), null);
    let score = hits.length;
    if (hits.some((h) => h.intense)) score += 2;
    if (topHours) score += topHours.value >= 10 ? 3 : 1;
    if (hits.some((h) => h.hasMoney)) score += 1;
    const first = hits[0]!;
    scored.push({
      score,
      pain: {
        id: cat.id,
        title: cat.title,
        description: cat.description,
        impact: topHours ? `about ${topHours.value} hours${topHours.per ? ` per ${topHours.per}` : ""}` : null,
        severity: severityFor(score),
        quote: first.sentence,
        segmentOrder: first.segmentOrder,
        currentState: cat.currentState,
        futureState: cat.futureState,
      },
    });
  }
  return scored
    .sort((a, b) => SEVERITY_RANK[b.pain.severity] - SEVERITY_RANK[a.pain.severity] || b.score - a.score)
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
      const nearest = mentions.reduce((best, m) =>
        Math.abs(m.index - money.start) < Math.abs(best.index - money.start) ? m : best,
      );
      const item = touch(nearest.name, nearest.purpose, order);
      item.monthlyCost = converted.monthly;
      item.annualCost = converted.annual;
      item.note = assumed ? "assumed monthly" : converted.note;
    }
  }
  return [...tools.values()];
}

// ---------- cues ----------

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

// ---------- question coverage ----------

type Ctx = {
  any: (re: RegExp) => boolean;
  client: (re: RegExp) => boolean;
  consultant: (re: RegExp) => boolean;
  painCount: number;
  hasCostedTool: boolean;
};

const TOPIC_DETECTORS: Record<string, (c: Ctx) => boolean> = {
  overview: (c) => c.any(/\bwe(?:'re| are| run| sell| serve| help| install| specialize)\b|who you serve|started the (business|company)|\bour (business|company)\b/i),
  team: (c) => c.client(/\bteam of\b|\bemployees\b|\bstaff\b|\btechnicians\b|\bpart[- ]time\b|\bfull[- ]time\b|\bheadcount\b|\bcrew\b|\b\d+ (people|employees|reps|agents)\b/i) || c.consultant(/how big is (the|your) team|how many (people|employees)/i),
  process: (c) => c.any(/walk me through|step by step|what happens (when|from)|\bit starts\b|here'?s how|how it works|\bthen (she|he|we|they)\b|after the job/i),
  pain: (c) => c.painCount > 0,
  impact: (c) => c.client(/\b\d+(?:\.\d+)?\s*(hours?|hrs?)\b|\bcost(s|ing)? (me|us)\b|\blosing\b|\bleaving [^.]{0,20}on the table\b/i),
  tools: (c) => c.consultant(/\b(software|tools?|apps?|systems?|subscriptions?)\b/i) || c.hasCostedTool,
  tried: (c) => c.any(/\btried\b|\battempted\b|\bwe (hired|bought|switched)\b|\bdropped it\b/i),
  goal: (c) => c.any(/\bwhat would (that|it) look like\b|a year from now|\b(six|6|twelve|12) months\b|\bsuccess\b|\bdream\b/i),
  urgency: (c) => c.any(/\bwhy now\b|driving the timing|\btimeline\b|\bbusy season\b|\bdeadline\b|\bas soon as\b|\basap\b|in the next \d+/i),
  budget: (c) => c.any(/\bbudget\b|\bset aside\b|\bafford\b|\binvestment\b|\binvest\b|\bspend\b/i),
  decision: (c) => c.any(/\bwho else\b|\bdecision\b|\bdecide\b|\bsign off\b|\bfinal call\b|\bfinal say\b|\bapprove\b/i),
  next: (c) => c.any(/\bnext steps?\b|\bsend (me|over)\b|\bproposal\b|\bbook a\b|\bschedule a\b|follow[- ]up call/i),
};

function detectTopics(segments: Segment[], painCount: number, hasCostedTool: boolean): string[] {
  const test = (list: Segment[]) => (re: RegExp) => list.some((s) => re.test(s.text));
  const ctx: Ctx = {
    any: test(segments),
    client: test(segments.filter((s) => s.speaker === "CLIENT")),
    consultant: test(segments.filter((s) => s.speaker === "CONSULTANT")),
    painCount,
    hasCostedTool,
  };
  return QUESTION_BANK.filter((q) => TOPIC_DETECTORS[q.topic]?.(ctx)).map((q) => q.topic);
}

/** The first bank question not yet covered (manual or AI), in natural call order. */
export function pickNextQuestion(covered: ReadonlySet<string>): NextQuestion {
  const next = QUESTION_BANK.find((q) => !covered.has(q.topic));
  if (!next) {
    return {
      topic: null,
      text: "Recap what you heard and confirm who needs to see the proposal.",
      why: "Every core question is covered — close the loop.",
    };
  }
  return { topic: next.topic, text: next.text, why: next.why };
}

// ---------- readiness ----------

function scoreReadiness(args: {
  signals: Cue[];
  objections: Cue[];
  money: MoneyMention[];
  painPoints: PainPoint[];
  clientText: string;
  heardAnything: boolean;
}): Readiness {
  const { signals, objections, painPoints, clientText } = args;
  const budget =
    signals.some((s) => s.kind === "Budget") || args.money.some((m) => BUDGET_CUE.test(m.context));
  const timeline = signals.some((s) => s.kind === "Urgency");
  const decisionFull = DECISION_MAKER.test(clientText);
  const decisionPartial = !decisionFull && DECISION_SHARED.test(clientText);

  const high = painPoints.filter((p) => p.severity === "high").length;
  const medium = painPoints.filter((p) => p.severity === "medium").length;
  const low = painPoints.filter((p) => p.severity === "low").length;

  const factors: ReadinessFactor[] = [
    { label: "Budget", points: budget ? 20 : 0, max: 20 },
    { label: "Urgency", points: timeline ? 20 : 0, max: 20 },
    { label: "Decision-maker", points: decisionFull ? 15 : decisionPartial ? 5 : 0, max: 15 },
    { label: "Pain", points: Math.min(20, high * 8 + medium * 4 + low * 2), max: 20 },
    { label: "Buying signals", points: Math.min(15, signals.length * 5), max: 15 },
    { label: "Objections", points: -Math.min(16, objections.length * 8), max: 0 },
  ];
  const score = Math.max(0, Math.min(100, factors.reduce((sum, f) => sum + f.points, 0)));

  let reason: string;
  if (!args.heardAnything) {
    reason = "Nothing heard yet — listen for budget, timeline and who decides.";
  } else {
    const confirmed = [budget && "budget", timeline && "urgency", decisionFull && "decision-maker"].filter(Boolean) as string[];
    const missing = [
      !budget && "budget",
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

function reflectBack(painPoints: PainPoint[], tech: TechItem[]): string {
  if (!painPoints.length) {
    return "Keep listening — no clear problem stated yet. Ask them to walk you through how it works today.";
  }
  const lines = painPoints.slice(0, 3).map((p) => `${p.title.charAt(0).toLowerCase()}${p.title.slice(1)}${p.impact ? ` (${p.impact})` : ""}`);
  let out = `What I'm hearing is ${joinList(lines)}.`;
  const named = tech.slice(0, 4).map((t) => t.tool);
  if (named.length) out += ` Tools mentioned so far: ${joinList(named)}.`;
  return `${out} Did I get that right, and what am I missing?`;
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

export function analyze(segments: Segment[]): Analysis {
  const ordered = [...segments].sort((a, b) => a.order - b.order);
  const clientSegments = ordered.filter((s) => s.speaker === "CLIENT");
  const clientSentences = clientSegments.flatMap((s) => splitSentences(s.text).map((text) => ({ text, order: s.order })));

  const painPoints = extractPainPoints(clientSentences);
  const tech = extractTech(clientSentences);
  const money: MoneyMention[] = clientSentences.flatMap(({ text, order }) =>
    findMoney(text).map((m) => ({ amount: m.amount, period: m.period, context: text, segmentOrder: order })),
  );
  const signals = extractCues(SIGNAL_RULES, clientSegments);
  const objections = extractCues(OBJECTION_RULES, clientSegments);

  const topicsCovered = detectTopics(ordered, painPoints.length, tech.some((t) => t.monthlyCost !== null));
  const readiness = scoreReadiness({
    signals,
    objections,
    money,
    painPoints,
    clientText: clientSegments.map((s) => s.text).join(" "),
    heardAnything: ordered.length > 0,
  });

  return {
    painPoints,
    money,
    tech,
    signals,
    objections,
    topicsCovered,
    talk: talkRatio(ordered),
    readiness,
    reflectBack: reflectBack(painPoints, tech),
    nextQuestion: pickNextQuestion(new Set(topicsCovered)),
  };
}
