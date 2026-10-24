/**
 * Checks for text a model WROTE (as opposed to quotes it located). Client-facing wording from a model must not
 * carry a figure the client never gave, a promise, a private concept, or a way to contact someone.
 */
import { findMoney } from "../mock-ai/money";
import { splitSentences } from "../mock-ai/engine";
import { parseTime } from "../mock-ai/quantities";

export class RejectedText extends Error {
  constructor(public why: string) {
    super(why);
    this.name = "RejectedText";
  }
}

/** Words that belong to the consultant's private view, or that say an AI wrote the page. */
const PRIVATE_TERMS = /\b(coaching|readiness|decision[- ]readiness|buying[- ]signals?|objections?|lead score|score|AI|A\.I\.|artificial intelligence|machine learning|language model|LLM|Claude|Anthropic|chatbot|prompt)\b/i;
const PROMISES = /\b(guarantee[sd]?|promise[sd]?|will (?:definitely |certainly )?(?:save|earn|make|double|triple|increase|eliminate)|you(?:'ll| will) (?:save|earn|make)|no risk|risk[- ]free|100%)\b/i;
const CONTACT = /(?:https?:\/\/|www\.|\b[\w.+-]+@[\w-]+\.[\w.]+|\+?\d[\d\s().-]{8,}\d)/i;
const MARKUP = /[<>`]|\bjavascript:/i;

/** Digit runs in `text`, commas removed ("$4,000" -> "4000"). */
export function digitRuns(text: string): string[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, "").replace(/\.$/, ""));
}

/** Numbers of this size or smaller are ordinary counting ("three tools", "two steps") rather than figures. */
const FREE_BELOW = 6;

export interface Allowed {
  /** Every number that appears in the data the model was given. */
  numbers: ReadonlySet<string>;
  /** Dollar amounts the client stated. */
  amounts: ReadonlySet<number>;
}

export function allowedFrom(texts: string[], amounts: number[] = []): Allowed {
  return { numbers: new Set(texts.flatMap(digitRuns)), amounts: new Set(amounts) };
}

/** Throws RejectedText unless every string is clean. */
export function assertClean(strings: string[], allowed: Allowed, opts: { allowMoney?: boolean } = {}): void {
  for (const s of strings) {
    if (PRIVATE_TERMS.test(s)) throw new RejectedText("mentions a private or AI-related term");
    if (PROMISES.test(s)) throw new RejectedText("makes a promise");
    if (CONTACT.test(s)) throw new RejectedText("contains a link, address or phone number");
    if (MARKUP.test(s)) throw new RejectedText("contains markup");
    for (const run of digitRuns(s)) {
      if (Number(run) < FREE_BELOW) continue;
      if (!allowed.numbers.has(run)) throw new RejectedText(`introduces the figure ${run}`);
    }
    for (const m of findMoney(s)) {
      if (!opts.allowMoney && !allowed.amounts.has(m.amount) && !allowed.numbers.has(String(m.amount))) throw new RejectedText(`introduces the amount ${m.amount}`);
    }
    for (const sentence of splitSentences(s)) {
      const t = parseTime(sentence);
      if (!t) continue;
      for (const n of [t.low, t.high]) if (n !== null && n >= FREE_BELOW && !allowed.numbers.has(String(n))) throw new RejectedText(`introduces the time figure ${n}`);
    }
  }
}
