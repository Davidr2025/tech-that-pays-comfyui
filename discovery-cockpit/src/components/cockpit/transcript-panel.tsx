"use client";

import { FastForward, Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PlayerStatus } from "@/hooks/use-player";
import type { Segment } from "@/lib/mock-ai/types";
import { cn } from "@/lib/utils";
import { PasteDialog } from "./paste-dialog";

export const SPEEDS = [1, 2, 4, 8] as const;

interface Props {
  segments: Segment[];
  playedCount: number;
  status: PlayerStatus;
  speed: number;
  onSpeed: (s: number) => void;
  onLoadDemo: () => void;
  onPause: () => void;
  onResume: () => void;
  onRestart: () => void;
  onSkip: () => void;
  onPaste: (text: string) => Promise<string | null>;
  busy: boolean;
  error: string | null;
}

export function TranscriptPanel(p: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const played = p.segments.slice(0, p.playedCount);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [p.playedCount]);

  const statusText =
    p.status === "playing"
      ? "Live"
      : p.status === "paused"
        ? "Paused"
        : p.status === "finished"
          ? "Call ended"
          : p.segments.length
            ? `Ready · ${p.segments.length} lines`
            : "No transcript";

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="space-y-2">
        <CardTitle className="flex items-center justify-between">
          Transcript
          <span
            className={cn("flex items-center gap-1.5 text-xs font-medium", p.status === "playing" ? "text-red-600" : "text-muted-foreground")}
            data-testid="player-status"
          >
            {p.status === "playing" && <span className="size-2 animate-pulse rounded-full bg-red-500" />}
            {statusText}
          </span>
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={p.onLoadDemo} disabled={p.busy} data-testid="load-demo-button">
            <Play /> Load Demo Call
          </Button>
          <PasteDialog onSubmit={p.onPaste} disabled={p.busy} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {p.status === "playing" ? (
            <Button size="sm" variant="secondary" onClick={p.onPause} data-testid="pause-button">
              <Pause /> Pause
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={p.onResume} disabled={p.status !== "paused"} data-testid="resume-button">
              <Play /> Resume
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={p.onRestart} disabled={!p.segments.length || p.busy} data-testid="restart-button">
            <RotateCcw /> Restart
          </Button>
          <Button size="sm" variant="ghost" onClick={p.onSkip} disabled={!p.segments.length || p.status === "finished"} data-testid="skip-button">
            <FastForward /> Skip to end
          </Button>
          <div className="ml-auto flex items-center gap-1" role="group" aria-label="Playback speed">
            {SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => p.onSpeed(s)}
                aria-pressed={p.speed === s}
                data-testid={`speed-${s}`}
                className={cn(
                  "rounded px-1.5 py-0.5 text-xs font-medium",
                  p.speed === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {s}×
              </button>
            ))}
          </div>
        </div>
        {p.error && (
          <p role="alert" className="text-sm text-destructive">
            {p.error}
          </p>
        )}
      </CardHeader>
      <CardContent ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto" data-testid="transcript-scroller">
        {played.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            {p.segments.length
              ? "The call hasn't started. Press Load Demo Call to play the sample discovery call, or paste your own transcript."
              : "No transcript yet. Load the demo call or paste one."}
          </p>
        ) : (
          played.map((s) => (
            <div key={s.order} data-testid="segment" data-speaker={s.speaker} className={cn("flex flex-col", s.speaker === "CONSULTANT" ? "items-start" : "items-end")}>
              <span className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {s.speaker === "CONSULTANT" ? "You" : "Client"}
              </span>
              <p
                className={cn(
                  "max-w-[92%] rounded-lg px-3 py-2 text-sm leading-relaxed",
                  s.speaker === "CONSULTANT" ? "bg-secondary" : "bg-sky-50 ring-1 ring-sky-100",
                )}
              >
                {s.text}
              </p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
