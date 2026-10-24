/** Small-number words, so "ten to twelve hours" reads like "10 to 12 hours". */
const WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
};

/** Regex source matching a digit run or a number word. */
export const NUM = `(?:\\d+(?:\\.\\d+)?|${Object.keys(WORDS).join("|")})`;
/** Regex source for "to" / "or" / dash between the ends of a range. */
export const RANGE_JOIN = "(?:\\s*(?:to|or|-|–)\\s*)";

export function toNumber(token: string): number {
  const n = Number(token);
  return Number.isNaN(n) ? (WORDS[token.toLowerCase()] ?? NaN) : n;
}

/** "3" or "3–4" */
export function formatRange(low: number, high: number | null): string {
  return high !== null && high !== low ? `${low}–${high}` : `${low}`;
}
