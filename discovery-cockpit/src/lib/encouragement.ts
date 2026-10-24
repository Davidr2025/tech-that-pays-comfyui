/**
 * Short lines for the consultant's footer during a call. Original wording, call-focused, and
 * private to the cockpit: nothing here is ever part of the review, the prototype or an export.
 */
export const ENCOURAGEMENT: readonly string[] = [
  "Listen for the number behind the complaint.",
  "A pause is a question. Let it do its work.",
  "You are here to understand, not to pitch.",
  "Ask what it costs, then stay quiet.",
  "Their words beat your summary. Quote them back.",
  "One good follow-up is worth three new questions.",
  "If they sound sure, ask what would change their mind.",
  "Name the hard part gently. Clients relax when it is said.",
  "Curious beats clever.",
  "The goal is clarity, not a yes today.",
  "Notice what they keep returning to.",
  "Slow down. The best answer is usually the third one.",
];

/** A stable starting line for a session, so the footer does not jump between renders. */
export function encouragementIndex(seed: string, step = 0): number {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (h + step) % ENCOURAGEMENT.length;
}
