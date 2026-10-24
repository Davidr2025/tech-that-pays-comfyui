"use client";

import { FastForward, Keyboard, Pause, Play, RotateCcw, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { PlayerStatus } from "@/hooks/use-player";
import { formatClock } from "@/lib/format";
import type { SpeakerKind } from "@/lib/mock-ai/types";
import { cn } from "@/lib/utils";
import { ImportDialog, type ImportRequest } from "./import-dialog";
import { MicControls } from "./mic-controls";

export const SPEEDS = [1, 2, 4, 8] as const;

export interface PanelSegment {
  order: number;
  speaker: SpeakerKind;
  text: string;
  startSec?: number | null;
}

interface Props {
  segments: PanelSegment[];
  playedCount: number;
  status: PlayerStatus;
  speed: number;
  onSpeed: (s: number) => void;
  onLoadDemo: () => void;
  onPause: () => void;
  onResume: () => void;
  onRestart: () => void;
  onSkip: () => void;
  onImport: (req: ImportRequest) => Promise<string | null>;
  onGoLive: () => void;
  onAppend: (speaker: SpeakerKind, text: string) => Promise<string | null>;
  consultantName: string;
  locked: boolean;
  busy: boolean;
  error: string | null;
  notice: string | null;
}

const STATUS_TEXT: Record<PlayerStatus, string> = { playing: "Replaying", paused: "Paused", finished: "Call ended", idle: "Ready", live: "Live" };

export function TranscriptPanel(p: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const played = p.segments.slice(0, p.playedCount);
  const live = p.status === "live";

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [p.playedCount]);

  const statusText = p.status === "idle" && !p.segments.length ? "No transcript" : p.status === "idle" ? `Ready · ${p.segments.length} turns` : STATUS_TEXT[p.status];

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="space-y-2">
        <CardTitle className="flex items-center justify-between">
          Transcript
          <span
            className={cn("flex items-center gap-1.5 text-xs font-medium", p.status === "playing" || live ? "text-red-600" : "text-muted-foreground")}
            data-testid="player-status"
          >
            {(p.status === "playing" || live) && <span className="size-2 animate-pulse rounded-full bg-red-500" />}
            {statusText}
          </span>
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={p.onLoadDemo} disabled={p.busy || p.locked} data-testid="load-demo-button">
            <Play /> Load Demo Call
          </Button>
          <ImportDialog consultantName={p.consultantName} onSubmit={p.onImport} disabled={p.busy || p.locked} />
          <Button size="sm" variant={live ? "secondary" : "outline"} onClick={p.onGoLive} disabled={p.busy || p.locked || live} data-testid="type-live-button">
            <Keyboard /> Type live
          </Button>
        </div>
        {!live && (
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
            <Button size="sm" variant="ghost" onClick={p.onRestart} disabled={!p.segments.length || p.busy || p.locked} data-testid="restart-button">
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
                  className={cn("rounded px-1.5 py-0.5 text-xs font-medium", p.speed === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>
        )}
        {p.error && (
          <p role="alert" className="text-sm text-destructive" data-testid="transcript-error">
            {p.error}
          </p>
        )}
        {p.notice && (
          <p role="status" className="text-xs text-muted-foreground" data-testid="transcript-notice">
            {p.notice}
          </p>
        )}
      </CardHeader>
      <CardContent ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto" data-testid="transcript-scroller">
        {played.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            {p.segments.length
              ? "The call hasn't started. Press Load Demo Call to play the sample, replay what you've loaded, or switch to Type live."
              : "No transcript yet. Paste or upload one, load the demo call, or press Type live and add lines as the call happens."}
          </p>
        ) : (
          played.map((s) => (
            <div key={s.order} data-testid="segment" data-speaker={s.speaker} className={cn("flex flex-col", s.speaker === "CONSULTANT" ? "items-start" : "items-end")}>
              <span className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {s.speaker === "CONSULTANT" ? "You" : "Client"}
                {s.startSec != null && <span className="ml-1.5 font-mono font-normal normal-case" data-testid="timestamp">{formatClock(s.startSec * 1000)}</span>}
              </span>
              <p className={cn("max-w-[92%] rounded-lg px-3 py-2 text-sm leading-relaxed", s.speaker === "CONSULTANT" ? "bg-secondary" : "bg-sky-50 ring-1 ring-sky-100")}>{s.text}</p>
            </div>
          ))
        )}
      </CardContent>
      {live && <MicControls onLine={p.onAppend} disabled={p.locked} />}
      {live && <LiveInput onAppend={p.onAppend} disabled={p.locked} />}
    </Card>
  );
}

/** The MANUAL source: type what was said, mark who said it, press Enter. The speaker flips after each line. */
function LiveInput({ onAppend, disabled }: { onAppend: Props["onAppend"]; disabled: boolean }) {
  const [speaker, setSpeaker] = useState<SpeakerKind>("CLIENT");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    const problem = await onAppend(speaker, text.trim());
    setBusy(false);
    if (problem) return setError(problem);
    setText("");
    setSpeaker((s) => (s === "CLIENT" ? "CONSULTANT" : "CLIENT"));
    input.current?.focus();
  }

  return (
    <form onSubmit={add} className="space-y-2 border-t p-3" data-testid="live-form">
      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Who is speaking">
          {(["CLIENT", "CONSULTANT"] as const).map((who) => (
            <button
              key={who}
              type="button"
              aria-pressed={speaker === who}
              onClick={() => setSpeaker(who)}
              data-testid={`speaker-${who}`}
              className={cn("rounded px-2.5 py-1 text-xs font-medium", speaker === who ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
            >
              {who === "CLIENT" ? "Client" : "You"}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">Press Enter to add. The speaker switches for you.</span>
      </div>
      <div className="flex gap-2">
        <Input
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={speaker === "CLIENT" ? "What the client just said…" : "What you just said…"}
          aria-label="Transcript line"
          maxLength={4000}
          disabled={disabled}
          data-testid="live-input"
        />
        <Button type="submit" size="icon" disabled={busy || disabled || !text.trim()} aria-label="Add line" data-testid="live-add">
          <Send />
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
