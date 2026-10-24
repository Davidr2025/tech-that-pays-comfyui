import { NUM, RANGE_JOIN, toNumber } from "./numbers";

export const TIME_RE = new RegExp(
  `\\b(${NUM})(?:${RANGE_JOIN}(${NUM}))?\\s+(?:full\\s+|whole\\s+)?(hours?|hrs?|days?)\\b(?:\\s*(?:a|per|each|every)\\s*(week|month|day))?`,
  "i",
);
export const COUNT_RE = new RegExp(
  `\\b(${NUM})(?:${RANGE_JOIN}(${NUM}))?\\s+(?:good |qualified |new |real )?(leads?|clients?|customers?|deals?|prospects?|estimate requests?|estimates?|inquiries|proposals?|jobs?)\\b[^.]{0,40}?\\b(?:a|per|each|every) (week|month|year)\\b`,
  "i",
);

export interface TimeQty {
  low: number;
  high: number | null;
  unit: "hours" | "days";
  per: string | null;
  /** Hours per week, when the client gave a weekly (or monthly) rate. Uses the top of a range. */
  weekly: number | null;
  /** The same rate using the bottom of a range: the conservative figure. */
  weeklyLow: number | null;
  /** The sentence this figure came from, so one statement is never counted twice. */
  source: string;
}
export interface CountQty {
  low: number;
  high: number | null;
  noun: string;
  per: string;
}

export function parseTime(sentence: string): TimeQty | null {
  const m = sentence.match(TIME_RE);
  if (!m) return null;
  const low = toNumber(m[1]!);
  const high = m[2] ? toNumber(m[2]) : null;
  const unit = m[3]!.toLowerCase().startsWith("d") ? "days" : "hours";
  const per = m[4]?.toLowerCase() ?? null;
  const toWeekly = (n: number) => {
    const hours = unit === "days" ? n * 8 : n;
    return per === "week" ? hours : per === "month" ? hours / 4.33 : null;
  };
  return { low, high, unit, per, weekly: toWeekly(high ?? low), weeklyLow: toWeekly(low), source: sentence };
}

export function parseCount(sentence: string): CountQty | null {
  const m = sentence.match(COUNT_RE);
  if (!m) return null;
  return { low: toNumber(m[1]!), high: m[2] ? toNumber(m[2]) : null, noun: m[3]!.toLowerCase(), per: m[4]!.toLowerCase() };
}

