/**
 * Who said what, for live speech recognition. Pure and browser-free, so the rules are testable.
 *
 * The consultant taps a speaker toggle to say who is talking. Speech engines finalise a sentence a
 * moment AFTER the person stops, so a naive "whoever is selected when the text arrives" gets the
 * hand-over wrong: the last words of the previous speaker land on the new one.
 *
 * The rule here: a tap never changes who owns text that is already in flight. It asks the engine to
 * finish the current utterance (stop), those words are attributed to the OLD speaker, and the new
 * speaker takes over when the engine session ends and a fresh one starts.
 */
import type { SpeakerKind } from "./mock-ai/types";

/** One line to save. */
export interface SpokenLine {
  speaker: SpeakerKind;
  text: string;
}

export interface RecognitionResult {
  transcript: string;
  isFinal: boolean;
}

/** A segment stays well under the server's 4,000-character limit; a long run-on is split at sentence ends. */
export const MAX_LINE_CHARS = 800;

/** Collapses whitespace; engines pad results with leading spaces and sometimes doubled ones. */
export const tidy = (s: string) => s.replace(/\s+/g, " ").trim();

/** Splits long text at sentence ends (then at spaces) into pieces of at most `max` characters. */
export function chunk(text: string, max = MAX_LINE_CHARS): string[] {
  const clean = tidy(text);
  if (clean.length <= max) return clean ? [clean] : [];
  const out: string[] = [];
  let rest = clean;
  while (rest.length > max) {
    const window = rest.slice(0, max);
    // Prefer the last sentence end in the window, then the last space, then a hard cut.
    const sentence = Math.max(window.lastIndexOf(". "), window.lastIndexOf("? "), window.lastIndexOf("! "));
    const cut = sentence > max * 0.4 ? sentence + 1 : window.lastIndexOf(" ") > 0 ? window.lastIndexOf(" ") : max;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

export class Attributor {
  private current: SpeakerKind;
  private pending: SpeakerKind | null = null;
  /** Result indexes already emitted in the current engine session. Engines restart numbering at 0 each session. */
  private emitted = new Set<number>();
  private interimText = "";
  private active = false;

  constructor(
    initial: SpeakerKind,
    private emit: (line: SpokenLine) => void,
  ) {
    this.current = initial;
  }

  get speaker(): SpeakerKind {
    return this.current;
  }

  /** The speaker the next session will use, if a change has been asked for. */
  get nextSpeaker(): SpeakerKind {
    return this.pending ?? this.current;
  }

  /** Text heard but not yet final, for showing as it arrives. */
  get interim(): string {
    return this.interimText;
  }

  /** An engine session began. */
  sessionStarted() {
    this.active = true;
    this.emitted = new Set();
    this.interimText = "";
  }

  /**
   * Feed a recognition event: the full `results` list and the lowest index that changed. Final results
   * that have not been emitted yet become lines for the speaker who OWNS this session; the rest is interim.
   */
  results(results: RecognitionResult[], resultIndex = 0) {
    let interim = "";
    for (let i = Math.max(0, resultIndex); i < results.length; i++) {
      const r = results[i]!;
      if (r.isFinal) {
        if (!this.emitted.has(i)) {
          this.emitted.add(i);
          for (const piece of chunk(r.transcript)) this.emit({ speaker: this.current, text: piece });
        }
      } else {
        interim += `${interim ? " " : ""}${tidy(r.transcript)}`;
      }
    }
    this.interimText = interim;
  }

  /**
   * The consultant tapped a speaker. Returns true when the engine should be stopped so the words in flight
   * finish under the old speaker (the new one applies once the session ends); false when nothing needs to stop.
   */
  requestSpeaker(next: SpeakerKind): boolean {
    if (next === this.nextSpeaker && this.pending === null) return false; // already them
    if (next === this.current) {
      this.pending = null; // tapped back before anything changed: cancel the change
      return false;
    }
    if (!this.active) {
      this.current = next; // nothing is being heard: change straight away
      this.pending = null;
      return false;
    }
    this.pending = next;
    return true;
  }

  /**
   * The engine session ended (it was stopped, or timed out on its own). Words that never became final are
   * kept as a line for the owning speaker, then a pending speaker change takes effect. Returns the flushed text.
   */
  sessionEnded(): string {
    const flushed = this.interimText;
    if (flushed) for (const piece of chunk(flushed)) this.emit({ speaker: this.current, text: piece });
    this.interimText = "";
    this.emitted = new Set();
    this.active = false;
    if (this.pending) {
      this.current = this.pending;
      this.pending = null;
    }
    return flushed;
  }
}
