export type SpeakerKind = "CONSULTANT" | "CLIENT";

export interface Segment {
  speaker: SpeakerKind;
  text: string;
  order: number;
}

export type Severity = "low" | "medium" | "high";
export type Period = "month" | "year" | "week" | "day" | "hour" | "unspecified";

export interface PainPoint {
  /** Stable category key, e.g. "manual_entry". */
  id: string;
  /** Neutral, client-safe label. */
  title: string;
  /** Neutral, client-safe one-sentence description. */
  description: string;
  /** Quantified impact the client stated, e.g. "about 15 hours per week". */
  impact: string | null;
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
}

export interface Analysis {
  painPoints: PainPoint[];
  money: MoneyMention[];
  tech: TechItem[];
  signals: Cue[];
  objections: Cue[];
  /** Question topics the engine considers covered so far. */
  topicsCovered: string[];
  talk: TalkRatio;
  readiness: Readiness;
  reflectBack: string;
  nextQuestion: NextQuestion;
}
