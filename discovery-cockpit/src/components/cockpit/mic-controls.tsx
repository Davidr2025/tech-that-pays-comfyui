"use client";

import { Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSpeech } from "@/hooks/use-speech";
import type { SpeakerKind } from "@/lib/mock-ai/types";
import { cn } from "@/lib/utils";

/** Live speech-to-text for the call, beside typing. Shown while the call is in "Type live" mode. */
export function MicControls({ onLine, disabled }: { onLine: (speaker: SpeakerKind, text: string) => Promise<string | null>; disabled: boolean }) {
  const s = useSpeech({ initialSpeaker: "CONSULTANT", onLine: (line) => onLine(line.speaker, line.text) });

  if (s.supported === null) return null; // not checked yet: render nothing rather than flash the wrong thing

  if (!s.supported) {
    return (
      <p className="border-t px-3 py-2 text-xs text-muted-foreground" data-testid="mic-unsupported">
        Live speech isn&apos;t available in this browser. Use Chrome, Edge or Safari for it, or keep typing the call below.
      </p>
    );
  }

  const listening = s.status === "listening";
  const starting = s.status === "starting";
  return (
    <div className="space-y-2 border-t p-3" data-testid="mic-controls">
      {starting ? (
        <div className="space-y-1.5" data-testid="mic-starting">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium" role="status">
              Starting the microphone… If your browser asks, choose Allow.
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={s.stop} data-testid="mic-cancel">
              Cancel
            </Button>
          </div>
          {s.hint && (
            <p className="text-xs text-muted-foreground" data-testid="mic-hint">
              {s.hint}
            </p>
          )}
        </div>
      ) : !listening ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={s.start} disabled={disabled} data-testid="mic-start">
              <Mic /> {s.status === "error" ? "Try the microphone again" : "Use the microphone"}
            </Button>
            <span className="text-xs text-muted-foreground">Optional. Typing below always works.</span>
          </div>
          <p className="text-xs text-muted-foreground" data-testid="mic-privacy">
            Your browser turns speech into text, and it may send the audio to its speech service to do that (Chrome sends it to Google, Safari to Apple). This app never records or stores audio, only the text. Start it only if your client
            has agreed to that.
          </p>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs font-medium text-red-600" role="status" data-testid="mic-listening">
              <span className="size-2 animate-pulse rounded-full bg-red-500" /> Listening
            </span>
            <div role="group" aria-label="Who is speaking" className="flex gap-1 rounded-md border p-0.5">
              {(["CONSULTANT", "CLIENT"] as const).map((who) => (
                <button
                  key={who}
                  type="button"
                  aria-pressed={s.speaker === who}
                  onClick={() => s.setSpeaker(who)}
                  data-testid={`mic-speaker-${who}`}
                  className={cn("rounded px-2.5 py-1 text-xs font-medium", s.speaker === who ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
                >
                  {who === "CONSULTANT" ? "You" : "Client"}
                </button>
              ))}
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={s.stop} data-testid="mic-stop">
              <Square /> Stop
            </Button>
          </div>
          <p className="min-h-[1.25rem] text-xs italic text-muted-foreground" aria-live="polite" data-testid="mic-interim">
            {s.interim ? `Hearing (${s.speaker === "CONSULTANT" ? "you" : "client"}): ${s.interim}` : "Tap who is speaking when the other person starts. Words already heard stay with whoever said them."}
          </p>
        </>
      )}
      {s.error && (
        <p role="alert" className="text-xs text-destructive" data-testid="mic-error">
          {s.error}
        </p>
      )}
      {s.saveError && (
        <p role="alert" className="text-xs text-destructive" data-testid="mic-save-error">
          A line was not saved: {s.saveError}
        </p>
      )}
    </div>
  );
}
