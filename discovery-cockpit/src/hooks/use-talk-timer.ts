"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Stopwatch for "how long have I been talking?". `speed` scales elapsed time so the timer
 * follows the call clock while the demo plays faster than real time.
 */
export function useTalkTimer(speed = 1) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [running, setRunning] = useState(false);
  const speedRef = useRef(speed);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    if (!running) return;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      // Compute the delta NOW: a state updater may run later, after `last` has moved on.
      const delta = (now - last) * speedRef.current;
      last = now;
      setElapsedMs((e) => e + delta);
    }, 100);
    return () => {
      clearInterval(id);
      // Keep the partial interval since the last tick, so stopping never drops time.
      const delta = (performance.now() - last) * speedRef.current;
      setElapsedMs((e) => e + delta);
    };
  }, [running]);

  const start = useCallback(() => setRunning(true), []);
  const stop = useCallback(() => setRunning(false), []);
  const reset = useCallback(() => setElapsedMs(0), []);

  return { elapsedMs, running, start, stop, reset };
}
