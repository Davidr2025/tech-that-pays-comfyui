/** Who gets the words when speech arrives and the consultant taps a speaker toggle. */
import { describe, expect, it } from "vitest";
import { Attributor, chunk, MAX_LINE_CHARS, tidy, type RecognitionResult, type SpokenLine } from "@/lib/speech-attribution";

const F = (transcript: string): RecognitionResult => ({ transcript, isFinal: true });
const I = (transcript: string): RecognitionResult => ({ transcript, isFinal: false });

function setup(initial: "CONSULTANT" | "CLIENT" = "CONSULTANT") {
  const lines: SpokenLine[] = [];
  const a = new Attributor(initial, (l) => lines.push(l));
  a.sessionStarted();
  return { a, lines };
}

describe("plain turns", () => {
  it("gives a final result to the selected speaker, and ignores interim text for saving", () => {
    const { a, lines } = setup("CONSULTANT");
    a.results([I("how many hours")]);
    expect(lines).toEqual([]);
    expect(a.interim).toBe("how many hours");
    a.results([F("How many hours a week does that take?")]);
    expect(lines).toEqual([{ speaker: "CONSULTANT", text: "How many hours a week does that take?" }]);
    expect(a.interim).toBe("");
  });

  it("emits each final result once, even if the engine repeats the event", () => {
    const { a, lines } = setup();
    const results = [F("First sentence.")];
    a.results(results, 0);
    a.results(results, 0);
    a.results([...results, F("Second sentence.")], 0);
    a.results([...results, F("Second sentence.")], 1);
    expect(lines.map((l) => l.text)).toEqual(["First sentence.", "Second sentence."]);
  });

  it("only looks from the first changed result, as the engine reports it", () => {
    const { a, lines } = setup();
    a.results([F("one"), F("two")], 0);
    a.results([F("one"), F("two"), I("thr")], 2);
    a.results([F("one"), F("two"), F("three")], 2);
    expect(lines.map((l) => l.text)).toEqual(["one", "two", "three"]);
  });

  it("tidies whitespace and skips blank finals", () => {
    const { a, lines } = setup();
    a.results([F("   we   lose\n leads  "), F("   "), F("")]);
    expect(lines).toEqual([{ speaker: "CONSULTANT", text: "we lose leads" }]);
    expect(tidy("  a \t b\n")).toBe("a b");
  });

  it("joins several interim pieces for display", () => {
    const { a } = setup();
    a.results([I("we use"), I(" hubspot")]);
    expect(a.interim).toBe("we use hubspot");
  });
});

describe("tapping a speaker", () => {
  it("while nothing is being heard, changes straight away and asks for no restart", () => {
    const lines: SpokenLine[] = [];
    const a = new Attributor("CONSULTANT", (l) => lines.push(l)); // no session started
    expect(a.requestSpeaker("CLIENT")).toBe(false);
    expect(a.speaker).toBe("CLIENT");
  });

  it("tapping the speaker who is already selected does nothing", () => {
    const { a } = setup("CLIENT");
    expect(a.requestSpeaker("CLIENT")).toBe(false);
    expect(a.nextSpeaker).toBe("CLIENT");
  });

  it("mid-sentence: the words in flight stay with the OLD speaker, the new one starts on the next session", () => {
    const { a, lines } = setup("CLIENT");
    a.results([I("we spend about ten hours")]);
    // The consultant taps "You" because they are about to speak.
    expect(a.requestSpeaker("CONSULTANT")).toBe(true); // the engine should be stopped
    expect(a.speaker).toBe("CLIENT"); // still the client's until the session ends
    expect(a.nextSpeaker).toBe("CONSULTANT");
    // The engine finalises what it heard as it stops: still the client's words.
    a.results([F("We spend about ten hours a week on reports.")]);
    expect(lines).toEqual([{ speaker: "CLIENT", text: "We spend about ten hours a week on reports." }]);
    a.sessionEnded();
    expect(a.speaker).toBe("CONSULTANT"); // and now it is the consultant's turn
    a.sessionStarted();
    a.results([F("And how long has that been going on?")]);
    expect(lines.at(-1)).toEqual({ speaker: "CONSULTANT", text: "And how long has that been going on?" });
  });

  it("words that never become final are kept for the old speaker when the session ends", () => {
    const { a, lines } = setup("CLIENT");
    a.results([I("my budget is around fifteen thousand")]);
    a.requestSpeaker("CONSULTANT");
    expect(a.sessionEnded()).toBe("my budget is around fifteen thousand");
    expect(lines).toEqual([{ speaker: "CLIENT", text: "my budget is around fifteen thousand" }]);
    expect(a.speaker).toBe("CONSULTANT");
  });

  it("a final result after the tap but before the session ends is not given to the new speaker", () => {
    const { a, lines } = setup("CLIENT");
    a.requestSpeaker("CONSULTANT");
    a.results([F("late words from the client")]);
    a.results([F("late words from the client"), F("more late words")], 1);
    expect(lines.every((l) => l.speaker === "CLIENT")).toBe(true);
  });

  it("tapping A then B then A quickly settles on the last tap", () => {
    const { a } = setup("CONSULTANT");
    expect(a.requestSpeaker("CLIENT")).toBe(true);
    expect(a.requestSpeaker("CONSULTANT")).toBe(false); // back to the current speaker: the change is cancelled
    expect(a.nextSpeaker).toBe("CONSULTANT");
    a.sessionEnded();
    expect(a.speaker).toBe("CONSULTANT");

    const b = setup("CONSULTANT");
    b.a.requestSpeaker("CLIENT");
    b.a.requestSpeaker("CLIENT"); // a second tap on the same one
    b.a.sessionEnded();
    expect(b.a.speaker).toBe("CLIENT");
  });

  it("an engine that times out by itself keeps the same speaker", () => {
    const { a, lines } = setup("CLIENT");
    a.results([F("first minute")]);
    a.sessionEnded(); // the browser ended the session on its own
    a.sessionStarted();
    a.results([F("second minute")]); // numbering starts again at 0: this must not be mistaken for a repeat
    expect(lines).toEqual([
      { speaker: "CLIENT", text: "first minute" },
      { speaker: "CLIENT", text: "second minute" },
    ]);
  });

  it("a second session's results are not suppressed by the first session's indexes", () => {
    const { a, lines } = setup();
    a.results([F("a"), F("b")]);
    a.sessionEnded();
    a.sessionStarted();
    a.results([F("c"), F("d")]);
    expect(lines.map((l) => l.text)).toEqual(["a", "b", "c", "d"]);
  });

  it("ending a session with nothing in flight flushes nothing", () => {
    const { a, lines } = setup();
    expect(a.sessionEnded()).toBe("");
    expect(a.sessionEnded()).toBe("");
    expect(lines).toEqual([]);
  });
});

describe("long speech", () => {
  const sentence = "We track every client in a spreadsheet and then copy it into the invoicing tool by hand. ";

  it("is split at sentence ends into pieces the server accepts", () => {
    const text = sentence.repeat(40).trim(); // ~3,500 characters
    const pieces = chunk(text);
    expect(pieces.length).toBeGreaterThan(3);
    for (const p of pieces) {
      expect(p.length).toBeLessThanOrEqual(MAX_LINE_CHARS);
      expect(p.endsWith(".")).toBe(true); // cut on a sentence end, not mid-word
    }
    expect(pieces.join(" ")).toBe(text); // nothing lost, nothing duplicated
  });

  it("falls back to spaces, then a hard cut, when there is no sentence end", () => {
    const words = Array.from({ length: 600 }, (_, i) => `word${i}`).join(" ");
    const pieces = chunk(words, 100);
    expect(pieces.every((p) => p.length <= 100 && !p.startsWith(" ") && !p.endsWith(" "))).toBe(true);
    expect(pieces.join(" ")).toBe(words);
    const solid = "x".repeat(250);
    expect(chunk(solid, 100)).toEqual(["x".repeat(100), "x".repeat(100), "x".repeat(50)]);
  });

  it("leaves short text alone and drops empty text", () => {
    expect(chunk("  hello  ")).toEqual(["hello"]);
    expect(chunk("   ")).toEqual([]);
    expect(chunk("")).toEqual([]);
  });

  it("a long final becomes several lines for the same speaker", () => {
    const { a, lines } = setup("CLIENT");
    a.results([F(sentence.repeat(40))]);
    expect(lines.length).toBeGreaterThan(3);
    expect(new Set(lines.map((l) => l.speaker))).toEqual(new Set(["CLIENT"]));
  });
});
