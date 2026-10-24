"use client";

import { useCallback, useEffect, useState } from "react";
import { countWords } from "@/lib/mock-ai/engine";

export type PlayerStatus = "idle" | "playing" | "paused" | "finished";

/** ~150 words per minute, with a floor so very short lines still register. */
export const WORDS_PER_SECOND = 2.5;
export const FIRST_SEGMENT_DELAY_MS = 400;

export function segmentDurationMs(text: string): number {
  return Math.max(1200, (countWords(text) / WORDS_PER_SECOND) * 1000);
}

/**
 * Plays a transcript back as if it were a live call: segment N+1 appears once segment N has
 * had time to be spoken, divided by `speed`. Pure client state — nothing leaves the browser.
 */
export function usePlayer(segments: { text: string }[], speed: number) {
  const [playedCount, setPlayedCount] = useState(0);
  const [status, setStatus] = useState<PlayerStatus>("idle");

  useEffect(() => {
    if (status !== "playing") return;
    if (playedCount >= segments.length) {
      setStatus("finished");
      return;
    }
    const previous = playedCount === 0 ? null : segments[playedCount - 1];
    const delay = previous ? segmentDurationMs(previous.text) / speed : FIRST_SEGMENT_DELAY_MS;
    const id = setTimeout(() => setPlayedCount((c) => c + 1), delay);
    return () => clearTimeout(id);
  }, [status, playedCount, segments, speed]);

  /** Start from the top. */
  const play = useCallback(() => {
    setPlayedCount(0);
    setStatus("playing");
  }, []);
  const pause = useCallback(() => setStatus((s) => (s === "playing" ? "paused" : s)), []);
  const resume = useCallback(() => setStatus((s) => (s === "paused" ? "playing" : s)), []);
  const skipToEnd = useCallback(() => {
    setPlayedCount(segments.length);
    setStatus("finished");
  }, [segments.length]);
  const reset = useCallback(() => {
    setPlayedCount(0);
    setStatus("idle");
  }, []);

  return { playedCount, status, play, pause, resume, skipToEnd, reset };
}
