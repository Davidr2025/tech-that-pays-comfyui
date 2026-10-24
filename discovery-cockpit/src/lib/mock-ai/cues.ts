import { NUM, RANGE_JOIN } from "./numbers";

export interface CueRule {
  kind: string;
  pattern: RegExp;
}

/**
 * Buying signals: explicit statements that the client wants to move, matched against
 * sentences the CLIENT says. (Budget, urgency and who decides are decision FACTS, below.)
 */
export const SIGNAL_RULES: CueRule[] = [
  {
    kind: "Ready to commit",
    pattern:
      /\b(i'?d|i would|i will|we'?d|we will) (sign|buy|hire|book|move forward|do it|get started)\b|\bsign (me )?up\b|\bready to (move forward|get started|start|sign)\b|\blet'?s (do it|move forward|get started)\b/i,
  },
  {
    kind: "Asks about starting",
    pattern: /\bhow (soon|fast|quickly) (can|could|would) (we|you|i) (start|begin|get started|kick off)\b|\bwhen can (we|you) (start|begin)\b/i,
  },
  {
    kind: "Wants a proposal",
    pattern: /\bsend (me|over)\b[^.]{0,25}\b(proposal|quote|pricing|estimate)\b/i,
  },
  {
    kind: "Price interest",
    pattern: /\b(how much|what (would|does) (it|that|this) cost|what'?s (the )?(price|pricing|cost)|ballpark)\b/i,
  },
];

/** Objections, matched against sentences the CLIENT says. */
export const OBJECTION_RULES: CueRule[] = [
  {
    kind: "Price",
    pattern: /\b(too expensive|can'?t afford|out of (our|my) budget|(seems|sounds|feels) (like )?(a lot|pricey|expensive)|that'?s a lot)\b/i,
  },
  {
    kind: "Past bad experience",
    pattern:
      /\b(burn(ed|t)|bad experience|tried (this|that|something like (this|that)) before|last (consultant|agency|vendor|time)|never (worked|delivered)|it broke|broke during)\b|\bi('m| am)? (a little |a bit |kind of )?(worried|concerned|nervous|skeptical|cautious|wary|hesitant)\b|\bi worry\b/i,
  },
  {
    kind: "Timing or authority",
    pattern: /\b(need to (think|talk|check|run it)|not the right time|bad timing|talk (it over )?with my (partner|wife|husband|boss|board|team)|run (it|this) (by|past))\b/i,
  },
];

const MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december";

/** The client says when this needs to be done. */
export const URGENCY_FACT = new RegExp(
  [
    "\\bneed (this|it|that|something)\\b[^.]{0,30}\\b(fixed|solved|done|in place|sorted|working)\\b",
    `\\b(?:in|within) the next ${NUM}(?:${RANGE_JOIN}${NUM})?\\s*(?:days?|weeks?|months?)\\b`,
    `\\bby (?:(?:(?:mid|early|late)[- ]|the end of |end of ))?(?:${MONTHS}|q[1-4]|next (?:week|month|quarter))\\b`,
    "\\bdeadline\\b|\\bas soon as\\b|\\basap\\b|\\bright away\\b|\\btop priority\\b",
    "\\bbefore (the|our) (busy season|summer|winter|spring|fall|peak|holidays|first heat wave|heat wave)\\b",
  ].join("|"),
  "i",
);

/** Pulls the date phrases out of an urgency sentence. */
export const DEADLINE_PHRASE = new RegExp(
  `\\bby ((?:(?:(?:mid|early|late)[- ]|the end of |end of ))?(?:${MONTHS}|q[1-4]|next (?:week|month|quarter)))\\b`,
  "i",
);
export const WINDOW_PHRASE = new RegExp(
  `\\b(?:in|within) (the next ${NUM}(?:${RANGE_JOIN}${NUM})?\\s*(?:days?|weeks?|months?))\\b`,
  "i",
);

/** The client sets aside, or can spend, a stated amount. */
export const BUDGET_FACT =
  /\b(set aside|budget(ed)? (of|is|for)|have a budget|can go higher|willing to (invest|spend|pay)|ready to invest|allocated)\b/i;

/** Client states they own the decision. */
export const DECISION_MAKER =
  /\bi (make|am making) the (final )?(call|decision)\b|\bfinal (call|say)\b|\bi decide\b|\bit'?s (my|just my) (call|decision)\b|\bi'?m the (owner|decision[- ]maker)\b|\bit'?s just me\b|\btrusts? my call\b/i;
/** Client names someone else who must approve. */
export const DECISION_SHARED =
  /\b(need|have) to (talk|check|run)\b|\b(partner|wife|husband|boss|board|investors?)\b[^.]{0,40}\b(decid\w*|approv\w*|sign\w* off)\b/i;

/** Cues that a dollar amount without a period is a recurring charge. */
export const RECURRING_CUE = /\b(subscription|plan|licen[sc]e|seat|per user|billed|we pay|paying|runs (us|about)|costs? (us|about))\b/i;
/** Cues that a dollar amount is a one-off charge, not a subscription. */
export const ONE_TIME_CUE = /\b(set-?up|onboarding|implementation|one[- ]time|upfront|up front|installation|fees?)\b/i;
