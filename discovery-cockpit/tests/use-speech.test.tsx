// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { START_HINT_MS, useSpeech } from "@/hooks/use-speech";
import type { SpokenLine } from "@/lib/speech-attribution";
import { FakeRecognition, install, uninstall } from "./fake-recognition";

beforeEach(() => {
  vi.useFakeTimers();
  FakeRecognition.all = [];
  FakeRecognition.autoStart = true;
  install();
});
afterEach(() => {
  uninstall();
  vi.useRealTimers();
});

const flush = async (ms = 0) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

function setup(onLine: (l: SpokenLine) => string | null | void | Promise<string | null | void> = () => null) {
  const lines: SpokenLine[] = [];
  const hook = renderHook(() =>
    useSpeech({
      onLine: (l) => {
        lines.push(l);
        return onLine(l);
      },
    }),
  );
  return { ...hook, lines };
}
const started = async (h: ReturnType<typeof setup>) => {
  await flush();
  act(() => h.result.current.start());
  await flush();
};

describe("support", () => {
  it("says unsupported when the browser has no speech recognition, and start does nothing", async () => {
    uninstall();
    const h = setup();
    await flush();
    expect(h.result.current.supported).toBe(false);
    act(() => h.result.current.start());
    expect(FakeRecognition.all).toHaveLength(0);
    expect(h.result.current.status).toBe("idle");
  });

  it("also accepts the unprefixed API", async () => {
    uninstall();
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeRecognition;
    const h = setup();
    await flush();
    expect(h.result.current.supported).toBe(true);
  });

  it("starts a continuous, interim-result session in the browser's language", async () => {
    const h = setup();
    await started(h);
    const rec = FakeRecognition.current();
    expect(rec).toMatchObject({ continuous: true, interimResults: true, started: true });
    expect(rec.lang).toBe(navigator.language || "en-US");
    expect(h.result.current.status).toBe("listening");
  });

  it("a second start while listening does not open a second session", async () => {
    const h = setup();
    await started(h);
    act(() => h.result.current.start());
    await flush();
    expect(FakeRecognition.all).toHaveLength(1);
  });
});

describe("while the browser has not answered yet (a permission prompt may be open)", () => {
  const silent = async () => {
    FakeRecognition.autoStart = false;
    const h = setup();
    await flush();
    act(() => h.result.current.start());
    await flush();
    return h;
  };

  it("says it is starting, rather than appearing to do nothing", async () => {
    const h = await silent();
    expect(h.result.current.status).toBe("starting");
    expect(h.result.current.hint).toBeNull(); // not yet: give the prompt a moment
  });

  it("after a while explains that the browser may be waiting for the person, without calling it an error", async () => {
    const h = await silent();
    await flush(START_HINT_MS + 100);
    expect(h.result.current.hint).toMatch(/permission prompt/);
    expect(h.result.current.error).toBeNull();
    expect(h.result.current.status).toBe("starting");
  });

  it("clicking Allow moves to listening and clears the hint", async () => {
    const h = await silent();
    await flush(START_HINT_MS + 100);
    act(() => FakeRecognition.current().grant());
    expect(h.result.current.status).toBe("listening");
    expect(h.result.current.hint).toBeNull();
  });

  it("cancelling goes back to idle and the hint never appears afterwards", async () => {
    const h = await silent();
    act(() => h.result.current.stop());
    await flush(START_HINT_MS * 2);
    expect(h.result.current.status).toBe("idle");
    expect(h.result.current.hint).toBeNull();
  });

  it("a refusal while starting shows the error and no hint", async () => {
    const h = await silent();
    act(() => FakeRecognition.current().error("not-allowed"));
    await flush(START_HINT_MS * 2);
    expect(h.result.current.status).toBe("error");
    expect(h.result.current.hint).toBeNull();
    expect(h.result.current.error).toMatch(/blocked/);
  });

  it("leaving while waiting leaves no timer behind", async () => {
    const h = await silent();
    h.unmount();
    await flush(START_HINT_MS * 2);
    expect(FakeRecognition.all).toHaveLength(1);
  });
});

describe("hearing and saving", () => {
  it("shows interim words, then saves the final sentence for the selected speaker and clears the interim", async () => {
    const h = setup();
    await started(h);
    act(() => FakeRecognition.current().hear("we lose about"));
    expect(h.result.current.interim).toBe("we lose about");
    expect(h.lines).toEqual([]);
    act(() => FakeRecognition.current().finalize("We lose about ten hours a week."));
    await flush();
    expect(h.lines).toEqual([{ speaker: "CONSULTANT", text: "We lose about ten hours a week." }]);
    expect(h.result.current.interim).toBe("");
  });

  it("saves lines one at a time, in the order they were said, even when the server is slow", async () => {
    const resolvers: (() => void)[] = [];
    const h = setup(() => new Promise<null>((resolve) => resolvers.push(() => resolve(null))));
    await started(h);
    act(() => FakeRecognition.current().finalize("First."));
    act(() => FakeRecognition.current().finalize("Second."));
    await flush();
    expect(h.lines.map((l) => l.text)).toEqual(["First."]); // the second waits its turn
    await act(async () => resolvers[0]!());
    await flush();
    expect(h.lines.map((l) => l.text)).toEqual(["First.", "Second."]);
  });

  it("reports a line the server refused, and keeps listening and saving", async () => {
    let n = 0;
    const h = setup(() => (n++ === 0 ? "That session is complete." : null));
    await started(h);
    act(() => FakeRecognition.current().finalize("Refused line."));
    await flush();
    expect(h.result.current.saveError).toBe("That session is complete.");
    expect(h.result.current.status).toBe("listening");
    act(() => FakeRecognition.current().finalize("Accepted line."));
    await flush();
    expect(h.result.current.saveError).toBeNull();
    expect(h.lines).toHaveLength(2);
  });
});

describe("tapping a speaker", () => {
  it("before starting, changes at once", async () => {
    const h = setup();
    await flush();
    act(() => h.result.current.setSpeaker("CLIENT"));
    expect(h.result.current.speaker).toBe("CLIENT");
    await started(h);
    act(() => FakeRecognition.current().finalize("A client line."));
    await flush();
    expect(h.lines[0]).toEqual({ speaker: "CLIENT", text: "A client line." });
  });

  it("mid-sentence: the words in flight stay with the old speaker and the new one takes the next session", async () => {
    const h = setup();
    await started(h);
    const first = FakeRecognition.current();
    act(() => first.hear("and my budget is about fifteen thousand")); // the consultant is "speaking" per the toggle...
    act(() => h.result.current.setSpeaker("CLIENT")); // ...they tap Client as the client takes over
    expect(h.result.current.speaker).toBe("CLIENT"); // the toggle shows the choice at once
    expect(first.stopped).toBe(true); // the engine was told to finish what it heard
    await flush();
    expect(h.lines).toEqual([{ speaker: "CONSULTANT", text: "and my budget is about fifteen thousand" }]); // old speaker keeps those words

    await flush(300); // the next session starts
    expect(FakeRecognition.all).toHaveLength(2);
    act(() => FakeRecognition.current().finalize("It needs to be done by November."));
    await flush();
    expect(h.lines[1]).toEqual({ speaker: "CLIENT", text: "It needs to be done by November." });
  });

  it("tapping the same speaker again does not interrupt the engine", async () => {
    const h = setup();
    await started(h);
    act(() => h.result.current.setSpeaker("CONSULTANT"));
    expect(FakeRecognition.current().stopped).toBe(false);
  });
});

describe("the engine ending by itself", () => {
  it("is restarted after a short pause, with the same speaker, and nothing is lost or repeated", async () => {
    const h = setup();
    await started(h);
    act(() => FakeRecognition.current().finalize("Before the timeout."));
    act(() => FakeRecognition.current().endByItself());
    expect(h.result.current.status).toBe("listening"); // we are still meant to be listening
    await flush(300);
    expect(FakeRecognition.all).toHaveLength(2);
    act(() => FakeRecognition.current().finalize("After the timeout."));
    await flush();
    expect(h.lines).toEqual([
      { speaker: "CONSULTANT", text: "Before the timeout." },
      { speaker: "CONSULTANT", text: "After the timeout." },
    ]);
  });

  it("keeps words that were still unfinished when the browser cut the session", async () => {
    const h = setup();
    await started(h);
    act(() => FakeRecognition.current().hear("cut off mid sentence"));
    act(() => FakeRecognition.current().endByItself());
    await flush();
    expect(h.lines).toEqual([{ speaker: "CONSULTANT", text: "cut off mid sentence" }]);
  });

  it("silence is not an error: no-speech just starts the next session", async () => {
    const h = setup();
    await started(h);
    act(() => FakeRecognition.current().error("no-speech"));
    act(() => FakeRecognition.current().endByItself());
    await flush(300);
    expect(h.result.current.error).toBeNull();
    expect(FakeRecognition.all).toHaveLength(2);
  });
});

describe("stopping", () => {
  it("stop() finishes what was heard, does not restart, and goes idle", async () => {
    const h = setup();
    await started(h);
    act(() => FakeRecognition.current().hear("last words"));
    act(() => h.result.current.stop());
    await flush(1000);
    expect(h.lines).toEqual([{ speaker: "CONSULTANT", text: "last words" }]);
    expect(h.result.current.status).toBe("idle");
    expect(FakeRecognition.all).toHaveLength(1);
  });

  it("can be started again afterwards", async () => {
    const h = setup();
    await started(h);
    act(() => h.result.current.stop());
    await flush();
    act(() => h.result.current.start());
    await flush();
    expect(FakeRecognition.all).toHaveLength(2);
    expect(h.result.current.status).toBe("listening");
  });

  it("leaving the page stops the engine and never restarts it", async () => {
    const h = setup();
    await started(h);
    const rec = FakeRecognition.current();
    h.unmount();
    expect(rec.aborted).toBe(true);
    await flush(2000);
    expect(FakeRecognition.all).toHaveLength(1);
  });
});

describe("when it cannot work", () => {
  it.each([
    ["not-allowed", /blocked/],
    ["service-not-allowed", /will not run speech recognition/],
    ["audio-capture", /No microphone was found/],
    ["language-not-supported", /language/],
  ])("%s ends with a plain message, no restart, and a way to try again", async (code, message) => {
    const h = setup();
    await started(h);
    act(() => FakeRecognition.current().error(code));
    act(() => FakeRecognition.current().endByItself());
    await flush(2000);
    expect(h.result.current.status).toBe("error");
    expect(h.result.current.error).toMatch(message);
    expect(FakeRecognition.all).toHaveLength(1); // it did not keep retrying a refusal
    act(() => h.result.current.start());
    await flush();
    expect(h.result.current.error).toBeNull(); // trying again clears the message
    expect(FakeRecognition.all).toHaveLength(2);
  });

  it("gives up after repeated network failures, but one blip is forgiven", async () => {
    const h = setup();
    await started(h);
    act(() => FakeRecognition.current().error("network"));
    act(() => FakeRecognition.current().endByItself());
    await flush(300);
    expect(h.result.current.status).toBe("listening");
    act(() => FakeRecognition.current().finalize("it came back")); // heard something: the count resets
    act(() => FakeRecognition.current().error("network"));
    act(() => FakeRecognition.current().endByItself());
    await flush(300);
    expect(h.result.current.error).toBeNull();
    act(() => FakeRecognition.current().error("network"));
    act(() => FakeRecognition.current().error("network"));
    expect(h.result.current.error).toMatch(/speech service could not be reached/);
    expect(h.result.current.status).toBe("error");
  });

  it("stops retrying a session that ends at once, again and again, without hearing anything", async () => {
    const h = setup();
    await started(h);
    for (let i = 0; i < 4; i++) {
      act(() => FakeRecognition.current().endByItself());
      await flush(300);
    }
    expect(h.result.current.error).toMatch(/keeps stopping/);
    expect(h.result.current.status).toBe("error");
    const count = FakeRecognition.all.length;
    await flush(5000);
    expect(FakeRecognition.all).toHaveLength(count); // and it stays stopped
  });

  it("a long quiet stretch is not mistaken for a failure", async () => {
    const h = setup();
    await started(h);
    for (let i = 0; i < 6; i++) {
      await flush(5000); // each session lasts a while before the browser ends it
      act(() => FakeRecognition.current().endByItself());
      await flush(300);
    }
    expect(h.result.current.error).toBeNull();
    expect(h.result.current.status).toBe("listening");
  });
});
