"use client";

import { useCallback, useEffect, useState } from "react";
import { countWords } from "@/lib/mock-ai/engine";

/** "live": lines are being typed in as the call happens, so everything stored is already "played". */
export type PlayerStatus = "idle" | "playing" | "paused" | "finished" | "live";

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
export function usePlayer(segments: { text: string; startSec?: number | null }[], speed: number) {
  const [playedCount, setPlayedCount] = useState(0);
  const [status, setStatus] = useState<PlayerStatus>("idle");

  useEffect(() => {
    if (status !== "playing") return;
    if (playedCount >= segments.length) {
      setStatus("finished");
      return;
    }
    const previous = playedCount === 0 ? null : segments[playedCount - 1];
    const next = segments[playedCount];
    // Real timestamps (VTT/SRT/typed) beat the speaking-time estimate when both ends have one.
    const real = previous?.startSec != null && next?.startSec != null ? (next.startSec - previous.startSec) * 1000 : null;
    const natural = real !== null && real > 0 ? Math.min(Math.max(real, 800), 20_000) : previous ? segmentDurationMs(previous.text) : FIRST_SEGMENT_DELAY_MS;
    const delay = previous ? natural / speed : FIRST_SEGMENT_DELAY_MS;
    const id = setTimeout(() => setPlayedCount((c) => c + 1), delay);
    return () => clearTimeout(id);
  }, [status, playedCount, segments, speed]);

  // In live mode the player never lags: whatever has been typed has happened.
  useEffect(() => {
    if (status === "live") setPlayedCount(segments.length);
  }, [status, segments.length]);

  const goLive = useCallback(() => {
    setStatus("live");
    setPlayedCount(segments.length);
  }, [segments.length]);

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

  return { playedCount, status, play, pause, resume, skipToEnd, reset, goLive };
}
