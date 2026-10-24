"use client";

/**
 * Live microphone transcription with the browser's Web Speech API (no key, no cost, no server of ours).
 * It is one more way to produce live lines: the text goes to the same `onLine` as typed lines do, so
 * analysis, the question checklist and the review keep working unchanged.
 *
 * What the browser does with the audio is the browser's business: Chrome sends it to Google's speech
 * service, Safari to Apple's. This app never records or stores audio; only the text is saved. The UI says
 * so before the first start.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { SpeakerKind } from "@/lib/mock-ai/types";
import { Attributor, type RecognitionResult, type SpokenLine } from "@/lib/speech-attribution";

/** The slice of the Web Speech API we use. (Typed here so we do not depend on a browser's lib.dom version.) */
export interface RecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type Ctor = new () => RecognitionLike;

export function recognitionCtor(): Ctor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type SpeechStatus = "idle" | "starting" | "listening" | "error";

const RESTART_DELAY_MS = 300;
/** A session that ends sooner than this with nothing heard is a failure to start, not a pause in the call. */
const QUICK_END_MS = 1500;
const MAX_QUICK_ENDS = 4;
const MAX_NETWORK_ERRORS = 2;
/** How long to wait for the engine to answer before saying it is probably waiting on a permission prompt. */
export const START_HINT_MS = 8_000;

const FATAL: Record<string, string> = {
  "not-allowed": "Microphone access was blocked. Allow the microphone for this site in your browser's address bar, then try again.",
  "service-not-allowed": "This browser will not run speech recognition here. You can keep typing the call instead.",
  "audio-capture": "No microphone was found. Plug one in, or keep typing the call.",
  "language-not-supported": "Your browser does not support speech recognition in its current language. You can keep typing the call instead.",
};

export interface UseSpeech {
  /** null until the browser has been checked (so the server render and first client render match). */
  supported: boolean | null;
  status: SpeechStatus;
  /** The speaker the NEXT words are attributed to (a tap shows here at once). */
  speaker: SpeakerKind;
  /** Words heard but not yet final. */
  interim: string;
  error: string | null;
  /** Shown while starting takes a while: not an error, the browser may simply be waiting for the person. */
  hint: string | null;
  /** The last problem saving a line (the server said no); listening continues. */
  saveError: string | null;
  start: () => void;
  stop: () => void;
  setSpeaker: (s: SpeakerKind) => void;
}

export function useSpeech({ initialSpeaker = "CONSULTANT", onLine }: { initialSpeaker?: SpeakerKind; onLine: (line: SpokenLine) => string | null | void | Promise<string | null | void> }): UseSpeech {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [status, setStatus] = useState<SpeechStatus>("idle");
  const [speaker, setSpeakerState] = useState<SpeakerKind>(initialSpeaker);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const hintTimer = useRef<number | undefined>(undefined);

  const recognition = useRef<RecognitionLike | null>(null);
  const wanted = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const startedAt = useRef(0);
  const heardSomething = useRef(false);
  const quickEnds = useRef(0);
  const networkErrors = useRef(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const onLineRef = useRef(onLine);
  onLineRef.current = onLine;

  // Lines are saved one after another, so they reach the server in the order they were said.
  const attributor = useRef<Attributor | null>(null);
  if (attributor.current === null) {
    attributor.current = new Attributor(initialSpeaker, (line) => {
      queue.current = queue.current.then(async () => {
        const problem = await onLineRef.current(line);
        setSaveError(typeof problem === "string" ? problem : null);
      });
    });
  }

  useEffect(() => setSupported(recognitionCtor() !== null), []);

  const clearHint = useCallback(() => {
    window.clearTimeout(hintTimer.current);
    setHint(null);
  }, []);

  const fail = useCallback(
    (message: string) => {
      wanted.current = false;
      window.clearTimeout(timer.current);
      clearHint();
      setError(message);
      setStatus("error");
    },
    [clearHint],
  );

  const begin = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor || !wanted.current) return;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = typeof navigator !== "undefined" && navigator.language ? navigator.language : "en-US";
    heardSomething.current = false;

    rec.onstart = () => {
      startedAt.current = Date.now();
      attributor.current!.sessionStarted();
      clearHint();
      setStatus("listening");
    };
    rec.onresult = (e) => {
      const list: RecognitionResult[] = [];
      for (let i = 0; i < e.results.length; i++) list.push({ transcript: e.results[i]![0]!.transcript, isFinal: e.results[i]!.isFinal });
      heardSomething.current = true;
      quickEnds.current = 0;
      networkErrors.current = 0;
      attributor.current!.results(list, e.resultIndex);
      setInterim(attributor.current!.interim);
    };
    rec.onerror = (e) => {
      if (FATAL[e.error]) return fail(FATAL[e.error]!);
      if (e.error === "network") {
        networkErrors.current += 1;
        if (networkErrors.current >= MAX_NETWORK_ERRORS) fail("The browser's speech service could not be reached. Check your connection, or keep typing the call.");
      }
      // "no-speech" and "aborted" are ordinary: the session ends and we start the next one.
    };
    rec.onend = () => {
      attributor.current!.sessionEnded();
      setInterim("");
      setSpeakerState(attributor.current!.speaker);
      recognition.current = null;
      if (!wanted.current) {
        clearHint();
        return setStatus((s) => (s === "error" ? s : "idle"));
      }
      if (!heardSomething.current && Date.now() - startedAt.current < QUICK_END_MS) {
        quickEnds.current += 1;
        if (quickEnds.current >= MAX_QUICK_ENDS) return fail("Speech recognition keeps stopping. Check the microphone, or keep typing the call.");
      }
      timer.current = window.setTimeout(begin, RESTART_DELAY_MS);
    };

    recognition.current = rec;
    try {
      rec.start();
    } catch {
      fail("Could not start the microphone. Try again.");
    }
  }, [fail, clearHint]);

  const start = useCallback(() => {
    if (recognition.current || wanted.current || !recognitionCtor()) return;
    wanted.current = true;
    quickEnds.current = 0;
    networkErrors.current = 0;
    setError(null);
    setSaveError(null);
    // Until the engine answers (a permission prompt may be open), say what is going on rather than nothing.
    setStatus("starting");
    window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(
      () => setHint("Still waiting. Your browser may be showing a permission prompt, or it may not support speech recognition on this page. You can keep typing the call."),
      START_HINT_MS,
    );
    begin();
  }, [begin]);

  const stop = useCallback(() => {
    wanted.current = false;
    window.clearTimeout(timer.current);
    clearHint();
    if (recognition.current) recognition.current.stop(); // onend flushes what was in flight
    else setStatus((s) => (s === "error" ? s : "idle"));
  }, [clearHint]);

  const setSpeaker = useCallback((next: SpeakerKind) => {
    const restart = attributor.current!.requestSpeaker(next);
    setSpeakerState(attributor.current!.nextSpeaker);
    if (restart) recognition.current?.stop(); // words in flight finish under the old speaker, then onend restarts
  }, []);

  useEffect(
    () => () => {
      wanted.current = false;
      window.clearTimeout(timer.current);
      window.clearTimeout(hintTimer.current);
      recognition.current?.abort();
    },
    [],
  );

  return { supported, status, speaker, interim, error, hint, saveError, start, stop, setSpeaker };
}
