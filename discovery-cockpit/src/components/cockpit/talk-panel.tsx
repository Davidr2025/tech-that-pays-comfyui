"use client";

import { Pause, Play, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { formatClock } from "@/lib/format";
import type { TalkRatio } from "@/lib/mock-ai/types";
import { isOverTarget, talkRatioTone, TARGET_MAX_SEC, TARGET_MIN_SEC, timerProgress } from "@/lib/talk-timer";
import { cn } from "@/lib/utils";

interface TalkTimerCardProps {
  elapsedMs: number;
  running: boolean;
  targetSec: number;
  onTarget: (sec: number) => void;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
  auto: boolean;
  onAuto: (auto: boolean) => void;
  clockSpeed: number;
}

export function TalkTimerCard(p: TalkTimerCardProps) {
  const over = isOverTarget(p.elapsedMs, p.targetSec);
  return (
    <Card className={cn(over && "border-red-400 ring-2 ring-red-200")}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Talk Timer
          {p.clockSpeed !== 1 && <Badge variant="secondary">call clock ×{p.clockSpeed}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline justify-between">
          <span className={cn("font-mono text-3xl font-semibold tabular-nums", over && "text-red-600")} data-testid="timer-display">
            {formatClock(p.elapsedMs)}
          </span>
          <span className="text-xs text-muted-foreground">target {p.targetSec}s</span>
        </div>
        <Progress value={timerProgress(p.elapsedMs, p.targetSec) * 100} indicatorClassName={over ? "bg-red-500" : "bg-primary"} />
        {over && (
          <p role="alert" className="animate-pulse rounded-md bg-red-50 px-2 py-1.5 text-sm font-medium text-red-700" data-testid="timer-warning">
            Over target — hand it back with a question.
          </p>
        )}
        <div>
          <label className="mb-1.5 block text-xs text-muted-foreground" id="target-label">
            Target: {p.targetSec} seconds
          </label>
          <Slider
            aria-labelledby="target-label"
            min={TARGET_MIN_SEC}
            max={TARGET_MAX_SEC}
            step={5}
            value={[p.targetSec]}
            onValueChange={(v) => p.onTarget(v[0] ?? p.targetSec)}
          />
        </div>
        <div className="flex items-center gap-2">
          {p.running ? (
            <Button size="sm" variant="secondary" onClick={p.onStop} data-testid="timer-stop">
              <Pause /> Stop
            </Button>
          ) : (
            <Button size="sm" onClick={p.onStart} data-testid="timer-start">
              <Play /> Start
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={p.onReset} data-testid="timer-reset">
            <RotateCcw /> Reset
          </Button>
          <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={p.auto} onChange={(e) => p.onAuto(e.target.checked)} />
            Follow the call
          </label>
        </div>
      </CardContent>
    </Card>
  );
}

const TONE_STYLES = { good: "bg-emerald-500", watch: "bg-amber-500", high: "bg-red-500" } as const;
const TONE_TEXT = {
  good: "Healthy — you're listening more than talking.",
  watch: "Creeping up — ask a question and listen.",
  high: "You're doing most of the talking.",
} as const;

export function TalkRatioCard({ talk }: { talk: TalkRatio }) {
  const empty = talk.consultantWords + talk.clientWords === 0;
  const tone = talkRatioTone(talk.consultantPct);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Talk Ratio</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex h-3 overflow-hidden rounded-full bg-secondary" aria-hidden>
          {!empty && (
            <>
              <div className={cn("transition-all", TONE_STYLES[tone])} style={{ width: `${talk.consultantPct}%` }} />
              <div className="bg-sky-400 transition-all" style={{ width: `${talk.clientPct}%` }} />
            </>
          )}
        </div>
        <div className="flex justify-between text-sm">
          <span data-testid="ratio-consultant">You {talk.consultantPct}%</span>
          <span data-testid="ratio-client">Client {talk.clientPct}%</span>
        </div>
        <p className="text-xs text-muted-foreground">{empty ? "Measured by words once the call starts." : TONE_TEXT[tone]}</p>
      </CardContent>
    </Card>
  );
}
