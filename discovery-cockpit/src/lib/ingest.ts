/**
 * Turns what a note-taker posts into transcript lines. Two shapes are understood:
 *
 *   simple   { "speaker": "client", "text": "…" }  or  { "lines": [ { "speaker": "Priya", "text": "…" } ] }
 *            speaker is "consultant"/"me"/"host", "client"/"guest", or a person's name
 *   Recall   the `transcript.data` real-time event of the Recall.ai meeting bot (words + participant)
 *
 * Whoever is not you is the client: a name counts as "you" when it matches the consultant's name (or the `me`
 * override). Pure and synchronous, so the same code is tested without a server.
 */
import type { SpeakerKind } from "./mock-ai/types";
import { MAX_SEGMENT_CHARS } from "./transcript";

export interface IngestLine {
  speaker: SpeakerKind;
  text: string;
}

export const MAX_INGEST_LINES = 50;
const ME_WORDS = new Set(["consultant", "me", "you", "host", "advisor", "interviewer"]);
const CLIENT_WORDS = new Set(["client", "customer", "guest", "prospect", "them"]);

const norm = (s: string) => s.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Is the person called `name` the consultant? Matches "David", "David R", "David Rhodd (Limitless)". */
export function isMe(name: string, me: string[]): boolean {
  const n = norm(name);
  if (!n) return false;
  return me.map(norm).filter((m) => m.length >= 2).some((m) => n === m || n.startsWith(`${m} `) || m.startsWith(`${n} `));
}

function speakerOf(raw: unknown, me: string[], isHost?: unknown): SpeakerKind {
  if (typeof raw === "string" && raw.trim()) {
    const w = norm(raw);
    if (ME_WORDS.has(w)) return "CONSULTANT";
    if (CLIENT_WORDS.has(w)) return "CLIENT";
    return isMe(raw, me) ? "CONSULTANT" : "CLIENT";
  }
  return isHost === true ? "CONSULTANT" : "CLIENT";
}

const clean = (t: unknown) => (typeof t === "string" ? t.replace(/\s+/g, " ").trim().slice(0, MAX_SEGMENT_CHARS) : "");
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

export type Parsed = { ok: true; lines: IngestLine[]; ignored?: string } | { ok: false; error: string };

export function parseIngest(body: unknown, me: string[]): Parsed {
  const b = obj(body);
  if (!b) return { ok: false, error: "Send a JSON object." };

  // Recall.ai real-time events.
  if (typeof b.event === "string" && b.event.startsWith("transcript.")) {
    if (b.event !== "transcript.data") return { ok: true, lines: [], ignored: b.event }; // partial results and status events
    const inner = obj(obj(b.data)?.data);
    const words = Array.isArray(inner?.words) ? inner.words : [];
    const text = clean(words.map((w) => obj(w)?.text).filter((t) => typeof t === "string").join(" "));
    const who = obj(inner?.participant);
    return { ok: true, lines: text ? [{ speaker: speakerOf(who?.name, me, who?.is_host), text }] : [] };
  }

  const items = Array.isArray(b.lines) ? b.lines : [b];
  if (items.length > MAX_INGEST_LINES) return { ok: false, error: `Send at most ${MAX_INGEST_LINES} lines at a time.` };
  const lines: IngestLine[] = [];
  for (const item of items) {
    const o = obj(item);
    const text = clean(o?.text);
    if (!o || !text) return { ok: false, error: 'Each line needs "text".' };
    lines.push({ speaker: speakerOf(o.speaker ?? o.name, me), text });
  }
  return { ok: true, lines };
}
