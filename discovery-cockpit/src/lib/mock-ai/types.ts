export type SpeakerKind = "CONSULTANT" | "CLIENT";

export interface Segment {
  speaker: SpeakerKind;
  text: string;
  order: number;
}

export type Severity = "low" | "medium" | "high";
export type Period = "month" | "year" | "week" | "day" | "hour" | "unspecified";

export interface PainPoint {
  /** Stable category key, e.g. "manual_reporting". */
  id: string;
  /** Neutral, client-safe label. */
  title: string;
  /** Neutral, client-safe one-sentence description. */
  description: string;
  /** Quantified impact the client stated, e.g. "about 10–12 hours per week". */
  impact: string | null;
  /** True when the client put a number on it (time, money or volume). */
  quantified: boolean;
  severity: Severity;
  /** The client's own words (consultant-only; never sent to the reveal). */
  quote: string;
  segmentOrder: number;
  currentState: string;
  futureState: string;
}

export interface MoneyMention {
  amount: number;
  period: Period;
  /** The sentence the client said it in. */
  context: string;
  segmentOrder: number;
}

export interface TechItem {
  tool: string;
  purpose: string;
  monthlyCost: number | null;
  annualCost: number | null;
  /** e.g. "billed annually" or "assumed monthly". */
  note: string | null;
  segmentOrder: number;
}

export interface Cue {
  kind: string;
  quote: string;
  segmentOrder: number;
}

/** What the client has said about the three things that decide whether a deal moves. */
export interface DecisionFacts {
  budget: Cue | null;
  urgency: Cue | null;
  /** "maker": owns the decision. "shared": someone else must approve. */
  decision: (Cue & { role: "maker" | "shared" }) | null;
}

/** Neutral date phrases lifted from the client's urgency statement (safe for the reveal). */
export interface Timeline {
  deadline: string | null;
  window: string | null;
}

export interface ReadinessFactor {
  label: string;
  points: number;
  max: number;
}

export interface Readiness {
  score: number;
  tier: "early" | "warming" | "ready";
  reason: string;
  factors: ReadinessFactor[];
}

export interface TalkRatio {
  consultantWords: number;
  clientWords: number;
  consultantPct: number;
  clientPct: number;
}

export interface NextQuestion {
  topic: string | null;
  text: string;
  why: string;
  /** The bank question that follows, when a contextual follow-up jumps the queue. */
  after?: string | null;
}

export interface Analysis {
  painPoints: PainPoint[];
  money: MoneyMention[];
  tech: TechItem[];
  /** Explicit buying statements ("I'd sign up tomorrow", "how fast could we start?"). */
  signals: Cue[];
  objections: Cue[];
  facts: DecisionFacts;
  timeline: Timeline;
  /** Question topics the engine considers covered so far. */
  topicsCovered: string[];
  talk: TalkRatio;
  readiness: Readiness;
  reflectBack: string;
  /** A contextual question that outranks the bank (e.g. "what is a recovered lead worth?"). */
  followUp: NextQuestion | null;
  nextQuestion: NextQuestion;
}
