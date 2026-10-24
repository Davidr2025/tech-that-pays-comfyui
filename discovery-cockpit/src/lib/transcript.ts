import type { SpeakerKind } from "./mock-ai/types";

export const MAX_TRANSCRIPT_CHARS = 2_000_000;
export const MAX_SEGMENTS = 5_000;
export const MAX_SEGMENT_CHARS = 4_000;

export interface ParsedSegment {
  speaker: SpeakerKind;
  text: string;
  /** Seconds from the start of the call, when the source had relative timestamps. */
  startSec?: number | null;
  /** The speaker label as written in the source (a name, "Consultant", ...). */
  label?: string | null;
}

export type TranscriptFormat = "vtt" | "srt" | "labeled" | "plain";

export interface ParseOptions {
  /** Which speaker label is the consultant. Everyone else is the client. */
  youLabel?: string | null;
  /** Flip every turn's speaker: for unlabeled text whose alternation guessed backwards. */
  swapRoles?: boolean;
}

export interface ParseResult {
  segments: ParsedSegment[];
  /** Distinct speaker labels, in order of first appearance. */
  speakers: string[];
  format: TranscriptFormat;
  /** Labels are real names and nobody said which is the consultant: ask. */
  needsYou: boolean;
  /** No speaker names in the source; speakers were alternated and may be reversed. */
  unattributed: boolean;
}

const CONSULTANT_LABEL = /^(consultant|me|you|interviewer|host|advisor|adviser|coach|rep)$/i;
const CLIENT_LABEL = /^(client|customer|prospect|them|guest|owner|interviewee)$/i;

const TS = String.raw`\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?(?:\s?[AaPp][Mm])?`;
const LEADING_TS = new RegExp(String.raw`^\s*[\[(]?(${TS})[\])]?\s*[-–]?\s+(.*)$`);
const BRACKET_LABEL = new RegExp(String.raw`^\s*\[([^\]]{1,40})\]\s*(?:\(?(${TS})\)?\s*)?:?\s*(.*)$`);
const PLAIN_LABEL = new RegExp(String.raw`^\s*([A-Za-z][A-Za-z0-9 .'_-]{0,30}?)\s*(?:[\[(](${TS})[\])]|\s(${TS}))?\s*(?:[:：]\s+|[:：]$)(.*)$`);
/** Role labels are accepted even without a space after the colon ("Client:Hi"). */
const ROLE_LABEL_LOOSE = /^\s*(consultant|client|me|you|host|customer|prospect|owner|interviewer|interviewee|guest|them|advisor|adviser|coach|rep)\s*[:：]\s*(.*)$/i;
const MAX_LABEL_WORDS = 4;

/** "00:01:05" -> 65; "01:05" -> 65. Wall-clock times ("10:01 AM") carry no offset, so null. */
export function toSeconds(ts: string): number | null {
  if (/[ap]m$/i.test(ts.trim())) return null;
  const parts = ts.replace(",", ".").split(":");
  const nums = parts.map((p) => Number.parseFloat(p));
  if (nums.some(Number.isNaN)) return null;
  const [a = 0, b = 0, c] = nums;
  return Math.floor(c === undefined ? a * 60 + b : a * 3600 + b * 60 + c);
}

interface Line {
  label: string | null;
  text: string;
  sec: number | null;
}

/** "Name: text", "[Name] 10:01:23: text", "00:01:05 Name: text", "Name (00:01:05): text". */
function parseLine(line: string): Line | null {
  let rest = line;
  let sec: number | null = null;
  const lead = rest.match(LEADING_TS);
  if (lead) {
    sec = toSeconds(lead[1]!);
    rest = lead[2]!;
  }
  const bracket = rest.match(BRACKET_LABEL);
  if (bracket) {
    return { label: bracket[1]!.trim(), text: (bracket[3] ?? "").trim(), sec: sec ?? (bracket[2] ? toSeconds(bracket[2]) : null) };
  }
  const plain = rest.match(PLAIN_LABEL);
  if (plain && plain[1]!.trim().split(/\s+/).length <= MAX_LABEL_WORDS) {
    const stamp = plain[2] ?? plain[3];
    return { label: plain[1]!.trim(), text: (plain[4] ?? "").trim(), sec: sec ?? (stamp ? toSeconds(stamp) : null) };
  }
  const loose = rest.match(ROLE_LABEL_LOOSE);
  if (loose) return { label: loose[1]!, text: (loose[2] ?? "").trim(), sec };
  return null;
}

const CUE_TIME = /(\d{1,2}:)?\d{2}:\d{2}[.,]\d{3}\s*-->\s*(\d{1,2}:)?\d{2}:\d{2}[.,]\d{3}/;

interface Cue {
  startSec: number | null;
  label: string | null;
  text: string;
}

/** WebVTT and SubRip. Speaker comes from <v Name> voice tags or a leading "Name:". */
function parseCues(raw: string): Cue[] {
  const blocks = raw.replace(/\r\n?/g, "\n").replace(/^\uFEFF/, "").split(/\n\s*\n/);
  const cues: Cue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trimEnd());
    const timeIdx = lines.findIndex((l) => CUE_TIME.test(l));
    if (timeIdx === -1) continue; // header, NOTE, STYLE, ...
    const start = lines[timeIdx]!.trim().split(/\s*-->/)[0]!;
    let text = lines.slice(timeIdx + 1).join(" ").trim();
    let label: string | null = null;
    const voice = text.match(/^<v(?:\.[^\s>]+)?\s+([^>]+)>/);
    if (voice) label = voice[1]!.trim();
    text = text.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (!label) {
      const named = text.match(/^([A-Za-z][A-Za-z0-9 .'_-]{0,30}?):\s+(.*)$/);
      if (named && named[1]!.trim().split(/\s+/).length <= MAX_LABEL_WORDS) {
        label = named[1]!.trim();
        text = named[2]!.trim();
      }
    }
    if (text) cues.push({ startSec: toSeconds(start), label, text });
  }
  return cues;
}

/** Unlabeled captions: a pause of this many seconds starts a new turn. */
const TURN_GAP_SEC = 3;

const sameLabel = (a: string | null, b: string | null) => (a ?? "").toLowerCase() === (b ?? "").toLowerCase();

function assignSpeakers(items: { label: string | null }[], opts: ParseOptions): { speakers: string[]; roles: SpeakerKind[]; needsYou: boolean } {
  const speakers: string[] = [];
  for (const { label } of items) {
    if (label && !speakers.some((s) => sameLabel(s, label))) speakers.push(label);
  }
  const you = opts.youLabel?.trim();
  const unknownOrder: string[] = [];
  const roleOf = (label: string): SpeakerKind => {
    if (you) return sameLabel(label, you) ? "CONSULTANT" : "CLIENT";
    if (CONSULTANT_LABEL.test(label)) return "CONSULTANT";
    if (CLIENT_LABEL.test(label)) return "CLIENT";
    const key = label.toLowerCase();
    if (!unknownOrder.includes(key)) unknownOrder.push(key);
    return unknownOrder.indexOf(key) === 0 ? "CONSULTANT" : "CLIENT";
  };
  const roles = items.map(({ label }) => (label ? roleOf(label) : "CONSULTANT"));
  const needsYou = !you && speakers.length >= 2 && speakers.every((s) => !CONSULTANT_LABEL.test(s) && !CLIENT_LABEL.test(s));
  return { speakers, roles, needsYou };
}

function fromCues(cues: Cue[], format: "vtt" | "srt", opts: ParseOptions): ParseResult {
  const labelled = cues.some((c) => c.label);
  if (!labelled) {
    // No names anywhere: group captions into turns by pause and alternate speakers.
    const turns: { startSec: number | null; text: string; last: number | null }[] = [];
    for (const c of cues) {
      const prev = turns[turns.length - 1];
      if (prev && c.startSec !== null && prev.last !== null && c.startSec - prev.last < TURN_GAP_SEC) {
        prev.text += ` ${c.text}`;
        prev.last = c.startSec;
      } else if (prev && (c.startSec === null || prev.last === null)) {
        prev.text += ` ${c.text}`;
      } else turns.push({ startSec: c.startSec, text: c.text, last: c.startSec });
    }
    return {
      segments: turns.map((t, i) => ({ speaker: (i % 2 === 0 ? "CONSULTANT" : "CLIENT") as SpeakerKind, text: t.text, startSec: t.startSec, label: null })),
      speakers: [],
      format,
      needsYou: false,
      unattributed: true,
    };
  }
  // Consecutive cues from the same speaker are one turn.
  const merged: Cue[] = [];
  for (const c of cues) {
    const prev = merged[merged.length - 1];
    if (prev && sameLabel(prev.label, c.label ?? prev.label)) prev.text += ` ${c.text}`;
    else merged.push({ ...c, label: c.label ?? prev?.label ?? null });
  }
  const { speakers, roles, needsYou } = assignSpeakers(merged, opts);
  return {
    segments: merged.map((c, i) => ({ speaker: roles[i]!, text: c.text, startSec: c.startSec, label: c.label })),
    speakers,
    format,
    needsYou,
    unattributed: false,
  };
}

function fromLines(lines: string[], opts: ParseOptions): ParseResult | null {
  const parsed = lines.map((l) => (l.trim() ? parseLine(l) : null));
  if (!parsed.some((p) => p?.label)) return null;

  const turns: { label: string | null; text: string; sec: number | null }[] = [];
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    const p = parsed[i];
    if (p?.label) turns.push({ label: p.label, text: p.text, sec: p.sec });
    else if (turns.length) {
      const last = turns[turns.length - 1]!;
      last.text = `${last.text} ${line.trim()}`.trim();
    } else turns.push({ label: null, text: line.trim(), sec: null });
  });
  const kept = turns.filter((t) => t.text.length > 0);
  const { speakers, roles, needsYou } = assignSpeakers(kept, opts);
  return {
    segments: kept.map((t, i) => ({ speaker: roles[i]!, text: t.text, startSec: t.sec, label: t.label })),
    speakers,
    format: "labeled",
    needsYou,
    unattributed: false,
  };
}

/**
 * Turns pasted or uploaded text into speaker segments.
 *
 *  - WebVTT / SubRip captions (Zoom and Teams transcripts): timestamps kept, speaker from
 *    <v Name> or "Name:"; consecutive cues from one speaker merge into a turn.
 *  - Labeled lines: "Consultant:", "Client:", "Name:", "[Name] 10:01:23: text", "Name (00:01:05): text".
 *  - Role labels (Consultant/Me/Host, Client/Customer/Owner) map directly. With real names, pass
 *    `youLabel` to say which one is the consultant; without it the first name seen is.
 *  - Unlabeled text alternates You, Client by paragraph (or by line when there are no blank lines);
 *    unlabeled captions alternate by pause.
 */
export function parseTranscriptDetailed(raw: string, opts: ParseOptions = {}): ParseResult {
  const result = parseWithoutSwap(raw, opts);
  if (!opts.swapRoles) return result;
  const flip = (s: SpeakerKind): SpeakerKind => (s === "CONSULTANT" ? "CLIENT" : "CONSULTANT");
  return { ...result, segments: result.segments.map((s) => ({ ...s, speaker: flip(s.speaker) })) };
}

function parseWithoutSwap(raw: string, opts: ParseOptions): ParseResult {
  const text = raw.replace(/\r\n?/g, "\n").replace(/^\uFEFF/, "");
  if (/^\s*WEBVTT/i.test(text) || CUE_TIME.test(text)) {
    const cues = parseCues(text);
    if (cues.length) return fromCues(cues, /^\s*WEBVTT/i.test(text) || /\d\.\d{3}\s*-->/.test(text) ? "vtt" : "srt", opts);
  }
  const labeled = fromLines(text.split("\n"), opts);
  if (labeled) return labeled;

  const lines = text.split("\n");
  const chunks = lines.some((l) => !l.trim()) ? text.split(/\n\s*\n/) : lines;
  const segments = chunks
    .map((c) => c.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((t, i) => ({ speaker: (i % 2 === 0 ? "CONSULTANT" : "CLIENT") as SpeakerKind, text: t, startSec: null, label: null }));
  return { segments, speakers: [], format: "plain", needsYou: false, unattributed: segments.length > 1 };
}

/** The segments only, for callers that don't need the detection details. */
export function parseTranscript(raw: string, opts: ParseOptions = {}): ParsedSegment[] {
  return parseTranscriptDetailed(raw, opts).segments;
}

/** Best default for "which speaker is you": a label matching the consultant's name, else the first. */
export function guessYouLabel(speakers: string[], consultantName: string): string | null {
  if (!speakers.length) return null;
  const mine = consultantName.trim().toLowerCase();
  const tokens = mine.split(/\s+/).filter((t) => t.length > 2);
  const match = speakers.find((s) => {
    const l = s.toLowerCase();
    return l === mine || (tokens.length > 0 && tokens.every((t) => l.includes(t))) || (tokens[0] !== undefined && l === tokens[0]);
  });
  return match ?? speakers[0]!;
}
