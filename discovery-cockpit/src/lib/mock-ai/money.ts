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

// ---------- spoken and plain forms: "4,000 dollars", "four thousand dollars", "four grand" ----------
//
// Speech engines, caption exports and typed notes rarely write "$4,000". A currency cue is still REQUIRED
// ($, "dollars", "bucks", or "grand" after an explicit number), so "ten thousand leads" and "a grand total"
// are never money.

const DIGITS_WITH_CURRENCY = /(?<![\d$,.])(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s?(k|m|thousand|million|grand)?\s*(?:dollars?|bucks?|CAD|USD)\b/gi;

const UNITS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const TEENS: Record<string, number> = { ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALES: Record<string, number> = { thousand: 1_000, grand: 1_000, million: 1_000_000 };
const NUMBER_WORD = new Set([...Object.keys(UNITS), ...Object.keys(TEENS), ...Object.keys(TENS), ...Object.keys(SCALES), "hundred", "and", "a"]);
const CURRENCY_WORD = /^(dollars?|bucks?)$/i;

/**
 * Evaluates a run of number words under a strict grammar, or returns null. "twelve hundred" is 1200 and
 * "four thousand five hundred" is 4500, but "nineteen ninety nine" is NOT summed to 118: it is rejected.
 */
export function wordsToNumber(tokens: string[]): number | null {
  let total = 0;
  let group = 0; // the part below 1,000 being built
  let low = 0; // the part below 100 being built
  let lowKind: "unit" | "teen" | "tens" | "tensunit" | null = null;
  let hundred = false;
  let lastScale = Infinity;
  let any = false;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t === "and") {
      if (!any) return null;
      continue;
    }
    if (t === "a") {
      const next = tokens[i + 1];
      if (lowKind !== null || !(next === "hundred" || next in SCALES)) return null;
      low = 1;
      lowKind = "unit";
    } else if (t in UNITS) {
      if (lowKind === null) {
        low = UNITS[t]!;
        lowKind = "unit";
      } else if (lowKind === "tens") {
        low += UNITS[t]!;
        lowKind = "tensunit";
      } else return null;
    } else if (t in TEENS) {
      if (lowKind !== null) return null;
      low = TEENS[t]!;
      lowKind = "teen";
    } else if (t in TENS) {
      if (lowKind !== null) return null;
      low = TENS[t]!;
      lowKind = "tens";
    } else if (t === "hundred") {
      if (lowKind === null || hundred) return null;
      group = low * 100;
      low = 0;
      lowKind = null;
      hundred = true;
    } else if (t in SCALES) {
      const part = group + low;
      const scale = SCALES[t]!;
      if (part === 0 || scale >= lastScale) return null; // "thousand thousand", or a million after a thousand
      total += part * scale;
      lastScale = scale;
      group = 0;
      low = 0;
      lowKind = null;
      hundred = false;
    } else return null;
    any = true;
  }
  return total + group + low;
}

function wordMoney(sentence: string): RawMoney[] {
  const out: RawMoney[] = [];
  const tokens = [...sentence.matchAll(/[A-Za-z$0-9,.'-]+/g)].map((m) => ({ text: m[0], lower: m[0].toLowerCase().replace(/[,.]+$/, ""), start: m.index ?? 0 }));
  // "twenty-five" is two number words joined by a hyphen.
  const flat: typeof tokens = [];
  for (const t of tokens) {
    const parts = t.lower.split("-");
    if (parts.length > 1 && parts.every((p) => NUMBER_WORD.has(p))) {
      let offset = t.start;
      for (const p of parts) {
        flat.push({ text: p, lower: p, start: offset });
        offset += p.length + 1;
      }
    } else flat.push(t);
  }
  for (let i = 0; i < flat.length; ) {
    if (!NUMBER_WORD.has(flat[i]!.lower)) {
      i++;
      continue;
    }
    let j = i;
    while (j < flat.length && NUMBER_WORD.has(flat[j]!.lower)) j++;
    // Trim a leading/trailing "and" or a trailing "a" ("two thousand dollars and a month"), then evaluate.
    let lo = i;
    let hi = j;
    while (lo < hi && flat[lo]!.lower === "and") lo++;
    while (hi > lo && (flat[hi - 1]!.lower === "and" || (flat[hi - 1]!.lower === "a" && !CURRENCY_WORD.test(flat[hi]?.lower ?? "")))) hi--;
    const run = flat.slice(lo, hi);
    const value = run.length ? wordsToNumber(run.map((t) => t.lower)) : null;
    const next = flat[hi]?.lower ?? "";
    const last = run[run.length - 1]?.lower;
    const hasNumber = run.some((t) => t.lower in UNITS || t.lower in TEENS || t.lower in TENS);
    // "four grand" is money; "a grand total" is not, so slang needs an explicit number before it.
    const money = value !== null && value > 0 && (CURRENCY_WORD.test(next) || (last === "grand" && hasNumber));
    if (money) {
      const start = run[0]!.start;
      const lastTok = run[run.length - 1]!;
      let end = lastTok.start + lastTok.text.replace(/[,.]+$/, "").length;
      if (CURRENCY_WORD.test(next)) end = flat[hi]!.start + flat[hi]!.text.replace(/[,.]+$/, "").length;
      out.push({ amount: value!, period: detectPeriod(sentence, start, end), start, end });
    }
    i = Math.max(j, i + 1);
  }
  return out;
}

export function findMoney(sentence: string): RawMoney[] {
  const out: RawMoney[] = [];
  const overlaps = (a: RawMoney) => out.some((b) => a.start < b.end && b.start < a.end);
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
  for (const m of sentence.matchAll(DIGITS_WITH_CURRENCY)) {
    const whole = (m[1] ?? "0").replace(/,/g, "");
    let amount = Number(`${whole}${m[2] ? `.${m[2]}` : ""}`);
    const suffix = (m[3] ?? "").toLowerCase();
    if (suffix === "k" || suffix === "thousand" || suffix === "grand") amount *= 1_000;
    if (suffix === "m" || suffix === "million") amount *= 1_000_000;
    const start = m.index ?? 0;
    const end = start + m[0].length;
    const found = { amount: Math.round(amount * 100) / 100, period: detectPeriod(sentence, start, end), start, end };
    if (!overlaps(found)) out.push(found);
  }
  for (const found of wordMoney(sentence)) if (!overlaps(found)) out.push(found);
  return out.sort((a, b) => a.start - b.start);
}

export const annualised = (m: Pick<RawMoney, "amount" | "period">): number =>
  m.period === "month" ? m.amount * 12 : m.period === "week" ? m.amount * 52 : m.amount;

export const formatDollars = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

