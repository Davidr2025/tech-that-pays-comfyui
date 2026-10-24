export interface CueRule {
  kind: string;
  pattern: RegExp;
}

/** Buying signals, matched against sentences the CLIENT says. */
export const SIGNAL_RULES: CueRule[] = [
  {
    kind: "Urgency",
    pattern:
      /\bneed (this|it|that|something)\b[^.]{0,30}\b(fixed|solved|done|in place|sorted|working)\b|\bin the next \d+\s*(days?|weeks?|months?)\b|\bbefore (the|our) (busy season|summer|winter|spring|fall|peak|holidays)\b|\bas soon as\b|\basap\b|\bright away\b|\btop priority\b/i,
  },
  {
    kind: "Budget",
    pattern:
      /\b(set aside|budget(ed)? (of|is|for)|have a budget|can go higher|willing to (invest|spend|pay)|ready to invest|allocated)\b/i,
  },
  {
    kind: "Ready to move",
    pattern:
      /\bsend (me|over)\b[^.]{0,25}\b(proposal|quote|pricing|estimate)\b|\bhow (soon|quickly) can\b|\bwhen can (we|you) (start|begin)\b|\blet'?s (do it|move forward|get started)\b|\bsign me up\b|\bready to (move forward|get started|start)\b/i,
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
      /\b(burn(ed|t)|bad experience|tried (this|that|something like (this|that)) before|last (consultant|agency|vendor|time)|never (worked|delivered))\b|\bi('m| am)? (a little |a bit |kind of )?(worried|concerned|nervous|skeptical)\b|\bi worry\b/i,
  },
  {
    kind: "Timing or authority",
    pattern: /\b(need to (think|talk|check|run it)|not the right time|bad timing|talk (it over )?with my (partner|wife|husband|boss|board|team)|run (it|this) (by|past))\b/i,
  },
];

/** Client states they own the decision. */
export const DECISION_MAKER = /\bi (make|am making) the (final )?(call|decision)\b|\bfinal (call|say)\b|\bi decide\b|\bit'?s my (call|decision)\b|\bi'?m the (owner|decision[- ]maker)\b/i;
/** Client names someone else who must approve. */
export const DECISION_SHARED = /\b(need|have) to (talk|check|run)\b|\b(partner|wife|husband|boss|board|investors?)\b[^.]{0,40}\b(decid\w*|approv\w*|sign\w* off)\b/i;
/** Budget language, used to flag dollar amounts as budget figures. */
export const BUDGET_CUE = /\b(budget|set aside|allocated|willing to (spend|invest)|can (spend|invest))\b/i;
/** Cues that a dollar amount without a period is a recurring charge. */
export const RECURRING_CUE = /\b(subscription|plan|licen[sc]e|seat|per user|billed|we pay|paying|runs (us|about)|costs? (us|about))\b/i;
/** Cues that a dollar amount is a one-off charge, not a subscription. */
export const ONE_TIME_CUE = /\b(set-?up|onboarding|implementation|one[- ]time|upfront|up front|installation|fees?)\b/i;
