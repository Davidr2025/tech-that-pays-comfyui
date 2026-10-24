"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { ENCOURAGEMENT, encouragementIndex } from "@/lib/encouragement";

const KEY = "dc.encouragement";
export const ROTATE_MS = 90_000;

function readPref(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

/** A quiet line for the consultant during the call. A per-device preference; never part of anything the client sees. */
export function EncouragementFooter({ seed }: { seed: string }) {
  const [on, setOn] = useState(true);
  const [step, setStep] = useState(0);

  useEffect(() => setOn(readPref()), []);
  useEffect(() => {
    if (!on) return;
    const id = window.setInterval(() => setStep((s) => s + 1), ROTATE_MS);
    return () => window.clearInterval(id);
  }, [on]);

  function toggle() {
    const next = !on;
    setOn(next);
    try {
      window.localStorage.setItem(KEY, next ? "on" : "off");
    } catch {
      /* the preference just will not stick */
    }
  }

  return (
    <footer className="flex items-center justify-between gap-3 border-t bg-card px-4 py-1.5 text-xs text-muted-foreground print:hidden" data-testid="encouragement">
      {on ? (
        <p className="flex items-center gap-1.5" data-testid="encouragement-line">
          <Sparkles className="size-3.5" aria-hidden /> {ENCOURAGEMENT[encouragementIndex(seed, step)]}
        </p>
      ) : (
        <span />
      )}
      <button type="button" onClick={toggle} className="underline-offset-2 hover:underline" aria-pressed={on} data-testid="encouragement-toggle">
        {on ? "Hide" : "Show encouragement"}
      </button>
    </footer>
  );
}
