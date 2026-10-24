"use client";

import { ExternalLink, EyeOff, FileText, Loader2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePlayer } from "@/hooks/use-player";
import { useTalkTimer } from "@/hooks/use-talk-timer";
import { analyze, pickNextQuestion } from "@/lib/mock-ai/engine";
import type { Segment } from "@/lib/mock-ai/types";
import { TARGET_DEFAULT_SEC } from "@/lib/talk-timer";
import type { CockpitData } from "@/server/sessions";
import { NextQuestionCard, ObjectionsCard, PainPointsCard, ReflectBackCard, SignalsCard } from "./coaching-panel";
import { ReadinessGauge } from "./readiness-gauge";
import { QuestionPanel, type QuestionRow } from "./question-panel";
import { TalkRatioCard, TalkTimerCard } from "./talk-panel";
import { TranscriptPanel } from "./transcript-panel";

async function post<T>(url: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: (json as { error?: string }).error ?? `Request failed (${res.status}).` };
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, error: "Could not reach the server." };
  }
}

export function Cockpit({ data }: { data: CockpitData }) {
  const [segments, setSegments] = useState<Segment[]>(data.segments);
  const [speed, setSpeed] = useState(4);
  const player = usePlayer(segments, speed);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // ---- live analysis of the call so far (pure, in-browser) ----
  const played = useMemo(() => segments.slice(0, player.playedCount), [segments, player.playedCount]);
  const analysis = useMemo(() => analyze(played), [played]);

  // ---- question checklist: manual ticks + AI detection ----
  const [manual, setManual] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(data.questions.map((q) => [q.id, q.manuallyCovered])),
  );
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const rows: QuestionRow[] = useMemo(
    () =>
      data.questions.map((q) => {
        const byManual = manual[q.id] === true;
        const byAI = !byManual && !dismissed.has(q.id) && analysis.topicsCovered.includes(q.topic);
        return { id: q.id, topic: q.topic, text: q.text, checked: byManual || byAI, byAI };
      }),
    [data.questions, manual, dismissed, analysis.topicsCovered],
  );
  const nextQuestion = useMemo(() => pickNextQuestion(new Set(rows.filter((r) => r.checked).map((r) => r.topic))), [rows]);

  function toggleQuestion(row: QuestionRow) {
    const covered = !row.checked;
    setManual((m) => ({ ...m, [row.id]: covered }));
    setDismissed((d) => {
      const next = new Set(d);
      if (covered) next.delete(row.id);
      else if (row.byAI) next.add(row.id);
      return next;
    });
    void fetch(`/api/sessions/${data.id}/questions/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ covered }),
    });
  }

  // ---- talk timer ----
  const [targetSec, setTargetSec] = useState(TARGET_DEFAULT_SEC);
  const [autoTimer, setAutoTimer] = useState(true);
  const clockSpeed = player.status === "playing" ? speed : 1;
  const timer = useTalkTimer(clockSpeed);
  const { start: startTimer, stop: stopTimer, reset: resetTimer } = timer;
  const lastSpeaker = played[played.length - 1]?.speaker;

  // A new consultant turn starts a fresh stopwatch; the client's turn stops it.
  useEffect(() => {
    if (autoTimer && lastSpeaker === "CONSULTANT") resetTimer();
  }, [autoTimer, lastSpeaker, player.playedCount, resetTimer]);
  useEffect(() => {
    if (!autoTimer) return;
    if (player.status === "playing" && lastSpeaker === "CONSULTANT") startTimer();
    else if (player.status !== "idle") stopTimer();
  }, [autoTimer, player.status, lastSpeaker, player.playedCount, startTimer, stopTimer]);

  // ---- loading a transcript ----
  async function loadTranscript(body: { mode: "demo" } | { mode: "paste"; text: string }): Promise<string | null> {
    setLoading(true);
    setLoadError(null);
    const res = await post<{ segments: Segment[] }>(`/api/sessions/${data.id}/transcript`, body);
    setLoading(false);
    if (!res.ok) {
      setLoadError(res.error);
      return res.error;
    }
    setSegments(res.data.segments);
    setManual({});
    setDismissed(new Set());
    setRevealPath(null);
    resetTimer();
    stopTimer();
    player.play();
    return null;
  }

  // Replaying the same transcript is a fresh call: clear every tick so AI detection starts clean.
  function restartCall() {
    setManual({});
    setDismissed(new Set());
    resetTimer();
    stopTimer();
    void fetch(`/api/sessions/${data.id}/questions`, { method: "DELETE" });
    player.play();
  }

  // ---- build the client review ----
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [revealPath, setRevealPath] = useState<string | null>(data.hasReport ? `/reveal/${data.id}` : null);

  const buildReview = useCallback(async () => {
    setBuilding(true);
    setBuildError(null);
    const res = await post<{ revealPath: string }>(`/api/sessions/${data.id}/review`, { upTo: player.playedCount });
    setBuilding(false);
    if (!res.ok) setBuildError(res.error);
    else setRevealPath(res.data.revealPath);
  }, [data.id, player.playedCount]);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b bg-card px-4 py-2.5">
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold leading-tight">{data.title}</h1>
          <p className="truncate text-xs text-muted-foreground">
            {data.clientName} · {data.clientCompany}
          </p>
        </div>
        <Badge variant="high" className="gap-1" title="Nothing on this page is ever shown on the client reveal">
          <EyeOff className="size-3" /> Private · consultant view
        </Badge>
        <div className="ml-auto flex items-center gap-2">
          {buildError && (
            <span role="alert" className="text-sm text-destructive">
              {buildError}
            </span>
          )}
          {revealPath && (
            <Button asChild variant="outline">
              <Link href={revealPath} target="_blank" data-testid="open-reveal-link">
                <ExternalLink /> Open Client Reveal
              </Link>
            </Button>
          )}
          <Button onClick={buildReview} disabled={building || player.playedCount === 0} data-testid="build-review-button">
            {building ? <Loader2 className="animate-spin" /> : <FileText />} Build Client Review
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/">Sessions</Link>
          </Button>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)_minmax(0,1.1fr)] lg:overflow-hidden">
        <section className="min-h-[28rem] lg:min-h-0" aria-label="Transcript">
          <TranscriptPanel
            segments={segments}
            playedCount={player.playedCount}
            status={player.status}
            speed={speed}
            onSpeed={setSpeed}
            onLoadDemo={() => void loadTranscript({ mode: "demo" })}
            onPause={player.pause}
            onResume={player.resume}
            onRestart={restartCall}
            onSkip={player.skipToEnd}
            onPaste={(text) => loadTranscript({ mode: "paste", text })}
            busy={loading}
            error={loadError}
          />
        </section>

        <section className="min-h-[28rem] lg:min-h-0" aria-label="Questions">
          <QuestionPanel rows={rows} onToggle={toggleQuestion} />
        </section>

        <section className="space-y-3 lg:min-h-0 lg:overflow-y-auto lg:pr-1" aria-label="Coaching">
          <ReadinessGauge readiness={analysis.readiness} />
          <NextQuestionCard next={nextQuestion} />
          <TalkTimerCard
            elapsedMs={timer.elapsedMs}
            running={timer.running}
            targetSec={targetSec}
            onTarget={setTargetSec}
            onStart={startTimer}
            onStop={stopTimer}
            onReset={resetTimer}
            auto={autoTimer}
            onAuto={setAutoTimer}
            clockSpeed={clockSpeed}
          />
          <TalkRatioCard talk={analysis.talk} />
          <ReflectBackCard text={analysis.reflectBack} />
          <PainPointsCard painPoints={analysis.painPoints} />
          <SignalsCard signals={analysis.signals} />
          <ObjectionsCard objections={analysis.objections} />
        </section>
      </main>
    </div>
  );
}
