"use client";

import { CheckCheck, ExternalLink, EyeOff, FileText, Loader2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StatusBadge } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePlayer } from "@/hooks/use-player";
import { useTalkTimer } from "@/hooks/use-talk-timer";
import { analyze, pickNextQuestion } from "@/lib/mock-ai/engine";
import type { SpeakerKind } from "@/lib/mock-ai/types";
import type { SessionStatus } from "@/lib/sessions";
import { TARGET_DEFAULT_SEC } from "@/lib/talk-timer";
import type { CockpitData } from "@/server/sessions";
import { DecisionFactsCard, NextQuestionCard, ObjectionsCard, PainPointsCard, ReflectBackCard, SignalsCard } from "./coaching-panel";
import type { ImportRequest } from "./import-dialog";
import { QuestionPanel, type QuestionRow } from "./question-panel";
import { ReadinessGauge } from "./readiness-gauge";
import { TalkRatioCard, TalkTimerCard } from "./talk-panel";
import { TranscriptPanel, type PanelSegment } from "./transcript-panel";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function request<T>(url: string, method: string, body?: unknown, keepalive = false): Promise<Result<T>> {
  try {
    const res = await fetch(url, { method, keepalive, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: (json as { error?: string }).error ?? `Request failed (${res.status}).` };
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, error: "Could not reach the server." };
  }
}

interface LoadResponse {
  segments: PanelSegment[];
  unattributed?: boolean;
  speakers?: string[];
}

export function Cockpit({ data }: { data: CockpitData }) {
  const [segments, setSegments] = useState<PanelSegment[]>(data.segments);
  const [speed, setSpeed] = useState(4);
  const player = usePlayer(segments, speed);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<SessionStatus>(data.status);
  const [brandingMode, setBrandingMode] = useState(data.brandingMode);
  const [brandNote, setBrandNote] = useState<string | null>(null);
  const locked = status === "COMPLETED";

  // ---- live analysis of the call so far (pure, in-browser) ----
  const played = useMemo(() => segments.slice(0, player.playedCount), [segments, player.playedCount]);
  const analysis = useMemo(() => analyze(played), [played]);

  // ---- question checklist: manual ticks + AI detection ----
  const [manual, setManual] = useState<Record<string, boolean>>(() => Object.fromEntries(data.questions.map((q) => [q.id, q.manuallyCovered])));
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
  const nextQuestion = useMemo(() => pickNextQuestion(new Set(rows.filter((r) => r.checked).map((r) => r.topic)), analysis.followUp), [rows, analysis.followUp]);

  function toggleQuestion(row: QuestionRow) {
    const covered = !row.checked;
    setManual((m) => ({ ...m, [row.id]: covered }));
    setDismissed((d) => {
      const next = new Set(d);
      if (covered) next.delete(row.id);
      else if (row.byAI) next.add(row.id);
      return next;
    });
    void request(`/api/sessions/${data.id}/questions/${row.id}`, "PATCH", { covered });
  }

  // ---- talk timer ----
  const [targetSec, setTargetSec] = useState(TARGET_DEFAULT_SEC);
  const [autoTimer, setAutoTimer] = useState(true);
  const clockSpeed = player.status === "playing" ? speed : 1;
  const timer = useTalkTimer(clockSpeed);
  const { start: startTimer, stop: stopTimer, reset: resetTimer } = timer;
  const lastSpeaker = played[played.length - 1]?.speaker;
  const following = autoTimer && player.status !== "live"; // typed-in lines are notes after the fact: don't follow them

  // A new consultant turn starts a fresh stopwatch; the client's turn stops it.
  useEffect(() => {
    if (following && lastSpeaker === "CONSULTANT") resetTimer();
  }, [following, lastSpeaker, player.playedCount, resetTimer]);
  useEffect(() => {
    if (!following) return;
    if (player.status === "playing" && lastSpeaker === "CONSULTANT") startTimer();
    else if (player.status !== "idle") stopTimer();
  }, [following, player.status, lastSpeaker, player.playedCount, startTimer, stopTimer]);

  // ---- loading a transcript: demo, paste, upload (all replace the call) ----
  const [revealPath, setRevealPath] = useState<string | null>(data.hasReport ? `/reveal/${data.id}` : null);

  async function loadTranscript(body: unknown): Promise<string | null> {
    setLoading(true);
    setLoadError(null);
    setNotice(null);
    const res = await request<LoadResponse>(`/api/sessions/${data.id}/transcript`, "POST", body);
    setLoading(false);
    if (!res.ok) {
      setLoadError(res.error);
      return res.error;
    }
    setSegments(res.data.segments);
    setManual({});
    setDismissed(new Set());
    setRevealPath(null);
    setStatus("LIVE");
    resetTimer();
    stopTimer();
    if (res.data.unattributed) setNotice("No speaker names in that file, so turns alternate starting with you. If that's backwards, import again and tick Swap.");
    player.play();
    return null;
  }

  const importTranscript = (req: ImportRequest) =>
    loadTranscript({ mode: req.mode, text: req.text, you: req.you, swap: req.swap || undefined, fileName: req.fileName });

  function restartCall() {
    setManual({});
    setDismissed(new Set());
    resetTimer();
    stopTimer();
    void request(`/api/sessions/${data.id}/questions`, "DELETE");
    player.play();
  }

  // ---- typing the call in as it happens (MANUAL source) ----
  const liveStart = useRef<number | null>(null);

  function goLive() {
    const last = segments[segments.length - 1]?.startSec ?? 0;
    liveStart.current = Date.now() - last * 1000;
    setNotice(null);
    setLoadError(null);
    player.goLive();
  }

  async function appendLine(speaker: SpeakerKind, text: string): Promise<string | null> {
    if (liveStart.current === null) liveStart.current = Date.now();
    const startSec = Math.max(0, Math.round((Date.now() - liveStart.current) / 1000));
    const res = await request<{ segment: PanelSegment }>(`/api/sessions/${data.id}/transcript`, "POST", { mode: "append", speaker, text, startSec });
    if (!res.ok) return res.error;
    setSegments((s) => [...s, res.data.segment]);
    if (status !== "COMPLETED") setStatus("LIVE");
    return null;
  }

  // ---- build the client review, reveal it, finish ----
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);

  const buildReview = useCallback(async () => {
    setBuilding(true);
    setBuildError(null);
    const res = await request<{ revealPath: string }>(`/api/sessions/${data.id}/review`, "POST", { upTo: player.playedCount });
    setBuilding(false);
    if (!res.ok) setBuildError(res.error);
    else {
      setRevealPath(res.data.revealPath);
      setStatus("REVIEW");
      setBrandNote(null);
    }
  }, [data.id, player.playedCount]);

  async function markStatus(to: "REVEALED" | "COMPLETED") {
    // keepalive: this fires as the reveal opens, and must survive the page being navigated away.
    const res = await request<{ status: SessionStatus }>(`/api/sessions/${data.id}/status`, "POST", { to }, true);
    if (res.ok) setStatus(res.data.status);
    else setBuildError(res.error);
  }

  async function chooseBranding(mode: "CONSULTANT" | "CLIENT") {
    if (mode === brandingMode) return;
    const res = await request(`/api/sessions/${data.id}`, "PATCH", { brandingMode: mode });
    if (!res.ok) return setBuildError(res.error);
    setBrandingMode(mode);
    if (revealPath) setBrandNote("Rebuild the client review to apply this branding.");
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b bg-card px-4 py-2.5">
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold leading-tight">{data.title}</h1>
          <p className="truncate text-xs text-muted-foreground">
            {data.clientName} · {data.clientCompany}
          </p>
        </div>
        <StatusBadge status={status} />
        <Badge variant="high" className="gap-1" title="Nothing on this page is ever shown on the client reveal">
          <EyeOff className="size-3" /> Private · consultant view
        </Badge>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-md border p-0.5 text-xs" role="group" aria-label="Review branding" data-testid="branding-switch">
            <span className="px-1.5 text-muted-foreground">Branding</span>
            {(["CONSULTANT", "CLIENT"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={brandingMode === mode}
                disabled={locked || (mode === "CLIENT" && !data.clientHasBrand)}
                title={mode === "CLIENT" && !data.clientHasBrand ? "Add this client's brand colours first" : undefined}
                onClick={() => void chooseBranding(mode)}
                data-testid={`branding-${mode}`}
                className={`rounded px-2 py-1 font-medium disabled:opacity-40 ${brandingMode === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >
                {mode === "CONSULTANT" ? "Mine" : "Client's"}
              </button>
            ))}
          </div>
          {(buildError || brandNote) && (
            <span role={buildError ? "alert" : "status"} className={`text-sm ${buildError ? "text-destructive" : "text-muted-foreground"}`} data-testid="header-message">
              {buildError ?? brandNote}
            </span>
          )}
          {revealPath && (
            <Button asChild variant="outline">
              <Link href={revealPath} target="_blank" data-testid="open-reveal-link" onClick={() => status === "REVIEW" && void markStatus("REVEALED")}>
                <ExternalLink /> Open Client Reveal
              </Link>
            </Button>
          )}
          <Button onClick={buildReview} disabled={building || locked || player.playedCount === 0} data-testid="build-review-button">
            {building ? <Loader2 className="animate-spin" /> : <FileText />} Build Client Review
          </Button>
          {(status === "REVIEW" || status === "REVEALED") && (
            <Button variant="secondary" onClick={() => void markStatus("COMPLETED")} data-testid="complete-button">
              <CheckCheck /> Mark complete
            </Button>
          )}
          <Button asChild variant="ghost" size="sm">
            <Link href="/">Sessions</Link>
          </Button>
        </div>
      </header>
      {locked && (
        <p role="status" className="border-b bg-muted px-4 py-2 text-sm text-muted-foreground" data-testid="complete-banner">
          This session is complete. The transcript and review are final. Start a new session for the next call.
        </p>
      )}

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
            onImport={importTranscript}
            onGoLive={goLive}
            onAppend={appendLine}
            consultantName={data.consultantName}
            locked={locked}
            busy={loading}
            error={loadError}
            notice={notice}
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
          <DecisionFactsCard facts={analysis.facts} timeline={analysis.timeline} />
          <ReflectBackCard text={analysis.reflectBack} />
          <PainPointsCard painPoints={analysis.painPoints} />
          <SignalsCard signals={analysis.signals} />
          <ObjectionsCard objections={analysis.objections} />
        </section>
      </main>
    </div>
  );
}
