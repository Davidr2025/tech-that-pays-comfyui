import type { Period } from "./types";

export interface RawMoney {
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

export const annualised = (m: Pick<RawMoney, "amount" | "period">): number =>
  m.period === "month" ? m.amount * 12 : m.period === "week" ? m.amount * 52 : m.amount;

export const formatDollars = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

