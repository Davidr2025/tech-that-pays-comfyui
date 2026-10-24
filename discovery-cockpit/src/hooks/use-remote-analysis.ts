"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Analysis } from "@/lib/mock-ai/types";
import type { ProviderId } from "@/lib/ai/types";

export interface RemoteAnswer {
  analysis: Analysis;
  provider: ProviderId;
  fellBack: boolean;
  upTo: number;
}

/** A short pause so a burst of lines (a spoken sentence arriving word by word) becomes one request. */
export const SETTLE_MS = 700;

/**
 * Asks the server to analyse the call up to line `upTo` and keeps the latest answer. One request at a time:
 * while one is out, newer lines wait for it and then go together. Never throws; on failure it keeps the last answer
 * (the cockpit shows the in-browser rules until the first one arrives).
 *
 * `epoch` changes when the call is replaced or restarted: the next request tells the server to begin again.
 */
export function useRemoteAnalysis({ sessionId, enabled, upTo, epoch }: { sessionId: string; enabled: boolean; upTo: number; epoch: number }) {
  const [answer, setAnswer] = useState<RemoteAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const want = useRef(upTo);
  const done = useRef(-1);
  const needReset = useRef(true);
  const flying = useRef(false);
  const alive = useRef(true);
  const lastEpoch = useRef(epoch);
  want.current = upTo;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const pump = useCallback(async () => {
    if (flying.current) return;
    flying.current = true;
    setBusy(true);
    try {
      while (alive.current && done.current !== want.current) {
        const target = want.current;
        const reset = needReset.current || target < done.current;
        let ok = false;
        try {
          const res = await fetch(`/api/sessions/${sessionId}/analysis`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ upTo: target, reset }),
          });
          const json = (await res.json().catch(() => ({}))) as Partial<RemoteAnswer> & { error?: string };
          if (res.ok && json.analysis) {
            ok = true;
            needReset.current = false;
            done.current = target;
            if (alive.current) {
              setAnswer(json as RemoteAnswer);
              setError(null);
            }
          } else if (alive.current) setError(json.error ?? `Analysis failed (${res.status}).`);
        } catch {
          if (alive.current) setError("Could not reach the server.");
        }
        if (!ok) break; // the next new line tries again
      }
    } finally {
      flying.current = false;
      if (alive.current) setBusy(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (lastEpoch.current !== epoch) {
      lastEpoch.current = epoch;
      needReset.current = true;
      done.current = -1;
      setAnswer(null);
    }
    if (!enabled || done.current === upTo) return;
    const t = setTimeout(() => void pump(), SETTLE_MS);
    return () => clearTimeout(t);
  }, [enabled, upTo, epoch, pump]);

  return { answer, error, busy };
}
