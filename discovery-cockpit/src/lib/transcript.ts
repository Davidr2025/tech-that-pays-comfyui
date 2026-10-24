import type { SpeakerKind } from "./mock-ai/types";

export const MAX_TRANSCRIPT_CHARS = 200_000;
export const MAX_SEGMENTS = 2_000;

const CONSULTANT_LABEL = /^(consultant|me|you|interviewer|host|advisor|adviser|coach|rep)$/i;
const CLIENT_LABEL = /^(client|customer|prospect|them|guest|owner|interviewee)$/i;
const LABELED_LINE = /^\s*([A-Za-z][A-Za-z0-9 .'_-]{0,30}?)\s*[:：]\s*(.*)$/;

export interface ParsedSegment {
  speaker: SpeakerKind;
  text: string;
}

/**
 * Turns pasted text into speaker segments.
 *
 *  - "Consultant:" / "Me:" / "Host:" ... -> CONSULTANT; "Client:" / "Customer:" ... -> CLIENT
 *  - Any other label ("Avery:", "Speaker 2:") is assigned in order of first appearance:
 *    first distinct label = CONSULTANT, every later one = CLIENT.
 *  - Unlabeled lines continue the previous segment.
 *  - If nothing is labeled at all, each blank-line-separated paragraph (or each line, when
 *    there are no blank lines) alternates CONSULTANT, CLIENT, CONSULTANT, ...
 */
export function parseTranscript(raw: string): ParsedSegment[] {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const labeled = lines.filter((l) => LABELED_LINE.test(l));

  if (labeled.length === 0) {
    const hasBlank = lines.some((l) => !l.trim());
    const chunks = hasBlank
      ? raw.replace(/\r\n?/g, "\n").split(/\n\s*\n/)
      : lines;
    return chunks
      .map((c) => c.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .map((text, i) => ({ speaker: (i % 2 === 0 ? "CONSULTANT" : "CLIENT") as SpeakerKind, text }));
  }

  const unknownOrder: string[] = [];
  const speakerFor = (label: string): SpeakerKind => {
    if (CONSULTANT_LABEL.test(label)) return "CONSULTANT";
    if (CLIENT_LABEL.test(label)) return "CLIENT";
    const key = label.toLowerCase();
    if (!unknownOrder.includes(key)) unknownOrder.push(key);
    return unknownOrder.indexOf(key) === 0 ? "CONSULTANT" : "CLIENT";
  };

  const out: ParsedSegment[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const m = line.match(LABELED_LINE);
    if (m) {
      const text = (m[2] ?? "").trim();
      out.push({ speaker: speakerFor((m[1] ?? "").trim()), text });
    } else if (out.length) {
      const last = out[out.length - 1]!;
      last.text = `${last.text} ${line.trim()}`.trim();
    } else {
      out.push({ speaker: "CONSULTANT", text: line.trim() });
    }
  }
  return out.filter((s) => s.text.length > 0);
}
