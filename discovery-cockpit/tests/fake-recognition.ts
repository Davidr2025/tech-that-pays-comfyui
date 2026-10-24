import type { RecognitionLike } from "@/hooks/use-speech";

/** A stand-in for the browser's engine that behaves like Chrome's: stop() finalises what it heard, then ends. */
export class FakeRecognition implements RecognitionLike {
  static all: FakeRecognition[] = [];
  /** When false the engine stays silent after start(), like a browser waiting on a permission prompt, until grant(). */
  static autoStart = true;
  static current() {
    return FakeRecognition.all[FakeRecognition.all.length - 1]!;
  }
  continuous = false;
  interimResults = false;
  lang = "";
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onresult: RecognitionLike["onresult"] = null;
  started = false;
  stopped = false;
  aborted = false;
  private results: { isFinal: boolean; 0: { transcript: string } }[] = [];
  constructor() {
    FakeRecognition.all.push(this);
  }
  start() {
    this.started = true;
    if (FakeRecognition.autoStart) this.onstart?.();
  }
  /** The person clicked Allow. */
  grant() {
    this.onstart?.();
  }
  stop() {
    this.stopped = true;
    const last = this.results[this.results.length - 1];
    if (last && !last.isFinal) this.finalize(last[0].transcript); // the engine finalises on stop
    this.onend?.();
  }
  abort() {
    this.aborted = true;
    this.onend?.();
  }
  /** Words heard but not final yet. */
  hear(text: string) {
    const i = this.results.length && !this.results[this.results.length - 1]!.isFinal ? this.results.length - 1 : this.results.length;
    this.results[i] = { isFinal: false, 0: { transcript: text } };
    this.onresult?.({ resultIndex: i, results: this.results });
  }
  finalize(text: string) {
    const i = this.results.length && !this.results[this.results.length - 1]!.isFinal ? this.results.length - 1 : this.results.length;
    this.results[i] = { isFinal: true, 0: { transcript: text } };
    this.onresult?.({ resultIndex: i, results: this.results });
  }
  error(code: string) {
    this.onerror?.({ error: code });
  }
  endByItself() {
    this.onend?.();
  }
}

export const install = () => ((window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition = FakeRecognition);
export const uninstall = () => {
  delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
};
