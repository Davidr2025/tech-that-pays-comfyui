"use client";

import { Check, CircleDot, FileBarChart, Pencil, Undo2, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/format";
import type { ContentData, FinanceData, NurtureData, SecurityData } from "@/lib/prototype/schema";
import { cn } from "@/lib/utils";

export function ExampleBadge({ children = "Example" }: { children?: string }) {
  return <span className="inline-flex items-center rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">{children}</span>;
}

function Intro({ text }: { text: string }) {
  return <p className="mb-3 text-sm text-slate-600">{text}</p>;
}

// ---------- Client Nurture ----------

const TEMP = {
  hot: { label: "Hot", dot: "bg-red-500", text: "text-red-700" },
  warm: { label: "Warm", dot: "bg-amber-500", text: "text-amber-700" },
  cold: { label: "Cold", dot: "bg-sky-500", text: "text-sky-700" },
} as const;

export function NurtureModule({ data }: { data: NurtureData }) {
  const [open, setOpen] = useState<string | null>(data.contacts[0]?.id ?? null);
  return (
    <div>
      <Intro text={data.summary} />
      <ul className="divide-y rounded-md border" data-testid="nurture-list">
        {data.contacts.map((c) => {
          const t = TEMP[c.temperature];
          const expanded = open === c.id;
          return (
            <li key={c.id} className="avoid-break">
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : c.id)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50"
                data-testid="nurture-row"
              >
                <span className={cn("size-2.5 shrink-0 rounded-full", t.dot)} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{c.label}</span>
                  <span className="block text-xs text-slate-500">
                    {c.stage} · {c.daysSinceContact} {c.daysSinceContact === 1 ? "day" : "days"} since contact
                  </span>
                </span>
                <span className={cn("text-xs font-semibold", t.text)}>{t.label}</span>
                <ExampleBadge />
              </button>
              {expanded && (
                <div className="border-t bg-slate-50 px-3 py-2.5 text-sm" data-testid="nurture-action">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Suggested next action</p>
                  <p className="mt-0.5">{c.nextAction}</p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <ul className="mt-3 space-y-1 text-xs text-slate-500">
        {data.basis.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
    </div>
  );
}

// ---------- Content Studio ----------

type DraftStatus = "pending" | "approved" | "rejected";

export function ContentModule({ data }: { data: ContentData }) {
  const [state, setState] = useState(() => Object.fromEntries(data.drafts.map((d) => [d.id, { status: "pending" as DraftStatus, body: d.body, editing: false }])));
  const patch = (id: string, p: Partial<(typeof state)[string]>) => setState((s) => ({ ...s, [id]: { ...s[id]!, ...p } }));
  const approved = Object.values(state).filter((d) => d.status === "approved").length;
  return (
    <div>
      <Intro text={data.summary} />
      <p className="mb-3 rounded-md bg-slate-50 p-2.5 text-xs text-slate-600">
        <span className="font-semibold">Voice:</span> {data.voice}
      </p>
      <ul className="space-y-3" data-testid="content-list">
        {data.drafts.map((d) => {
          const st = state[d.id]!;
          return (
            <li key={d.id} className="avoid-break rounded-md border p-3" data-testid="draft" data-status={st.status}>
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{d.topic}</span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{d.channel}</span>
                <ExampleBadge>Example draft</ExampleBadge>
                <span
                  className={cn("ml-auto text-xs font-medium", st.status === "approved" && "text-emerald-700", st.status === "rejected" && "text-slate-400 line-through", st.status === "pending" && "text-slate-500")}
                  data-testid="draft-status"
                >
                  {st.status === "approved" ? "Approved, ready to publish" : st.status === "rejected" ? "Rejected" : "Waiting for your review"}
                </span>
              </div>
              {st.editing ? (
                <Textarea value={st.body} onChange={(e) => patch(d.id, { body: e.target.value })} rows={6} aria-label={`Edit draft: ${d.topic}`} data-testid="draft-editor" />
              ) : (
                <p className={cn("whitespace-pre-line text-sm leading-relaxed", st.status === "rejected" && "text-slate-400")}>{st.body}</p>
              )}
              <div className="mt-2.5 flex flex-wrap gap-2 print:hidden">
                {st.editing ? (
                  <Button size="sm" onClick={() => patch(d.id, { editing: false })} data-testid="draft-save">
                    <Check /> Save edit
                  </Button>
                ) : st.status === "pending" ? (
                  <>
                    <Button size="sm" onClick={() => patch(d.id, { status: "approved" })} data-testid="draft-approve">
                      <Check /> Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => patch(d.id, { editing: true })} data-testid="draft-edit">
                      <Pencil /> Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => patch(d.id, { status: "rejected" })} data-testid="draft-reject">
                      <X /> Reject
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => patch(d.id, { status: "pending" })} data-testid="draft-undo">
                    <Undo2 /> Back to review
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-slate-500" data-testid="content-count">
        {approved} of {data.drafts.length} approved. Nothing is published until a person approves it.
      </p>
    </div>
  );
}

// ---------- Financial Pulse ----------

export function FinanceModule({ data }: { data: FinanceData }) {
  const [reportOpen, setReportOpen] = useState(false);
  const [generatedAt, setGeneratedAt] = useState("");
  return (
    <div>
      <Intro text={data.summary} />
      <ul className="space-y-4" data-testid="finance-list">
        {data.lines.map((l) => {
          const used = Math.round((l.actual / l.budget) * 100);
          const remaining = l.budget - l.actual;
          const over = remaining < 0;
          // A receivables "budget" is only a placeholder ceiling, so don't call it a budget overrun.
          const ceiling = l.key === "receivables";
          return (
            <li key={l.key} className="avoid-break" data-testid="finance-line" data-key={l.key}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-sm font-medium">{l.label}</span>
                <span className="text-sm tabular-nums">
                  {formatMoney(l.actual)} <span className="text-slate-400">of {formatMoney(l.budget)}</span>
                </span>
              </div>
              <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={`${l.label}: ${used}% of budget`} aria-valuenow={Math.min(used, 100)} aria-valuemin={0} aria-valuemax={100}>
                <div className={cn("h-full rounded-full", over ? "bg-red-500" : used >= 85 ? "bg-amber-500" : "bg-[var(--brand,#0f766e)]")} style={{ width: `${Math.min(used, 100)}%` }} />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span data-testid="finance-used">{used}% of {ceiling ? "target ceiling" : "budget"} used</span>
                <span>·</span>
                <span className={over ? "font-medium text-red-700" : undefined} data-testid="finance-remaining">
                  {over ? `${formatMoney(-remaining)} ${ceiling ? "above the target ceiling" : "over budget"}` : `${formatMoney(remaining)} ${ceiling ? "below the target ceiling" : "remaining"}`}
                </span>
                {l.source === "stated" ? <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800">From your call</span> : <ExampleBadge />}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          variant="outline"
          className="print:hidden"
          onClick={() => {
            setGeneratedAt(new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }));
            setReportOpen(true);
          }}
          data-testid="run-report"
        >
          <FileBarChart /> Run Report
        </Button>
        <span className="text-xs text-slate-500">{data.note}</span>
      </div>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent data-testid="report-dialog">
          <DialogTitle>Financial Pulse report</DialogTitle>
          <DialogDescription>
            {data.period}. A mock report: in the real system this runs against your accounting data. Generated {generatedAt}.
          </DialogDescription>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-1.5 font-medium">Line</th>
                <th className="py-1.5 text-right font-medium">Actual</th>
                <th className="py-1.5 text-right font-medium">Budget</th>
                <th className="py-1.5 text-right font-medium">Used</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((l) => (
                <tr key={l.key} className="border-b">
                  <td className="py-1.5">{l.label}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatMoney(l.actual)}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatMoney(l.budget)}</td>
                  <td className="py-1.5 text-right tabular-nums">{Math.round((l.actual / l.budget) * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-slate-500">Lines marked Example on the dashboard use illustrative figures.</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- Security & Governance ----------

const SEV = {
  high: { label: "High", cls: "border-red-200 bg-red-50 text-red-700" },
  medium: { label: "Medium", cls: "border-amber-200 bg-amber-50 text-amber-800" },
  low: { label: "Low", cls: "border-slate-200 bg-slate-50 text-slate-600" },
} as const;

export function timeAgo(minutes: number): string {
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const h = Math.floor(minutes / 60);
  return `${h} ${h === 1 ? "hour" : "hours"} ago`;
}

export function SecurityModule({ data }: { data: SecurityData }) {
  return (
    <div>
      <Intro text={data.summary} />
      <p className="mb-2 flex items-center gap-1.5 text-xs text-slate-500">
        <CircleDot className="size-3.5 animate-pulse text-emerald-600" aria-hidden /> Monitoring · example feed
      </p>
      <ul className="divide-y rounded-md border" data-testid="security-feed">
        {data.feed.map((a) => (
          <li key={a.id} className="avoid-break px-3 py-2.5" data-testid="alert" data-level={a.severity}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("rounded border px-1.5 py-0.5 text-[11px] font-semibold", SEV[a.severity].cls)}>{SEV[a.severity].label}</span>
              <span className="text-sm font-medium">{a.title}</span>
              <ExampleBadge />
              <span className="ml-auto text-xs text-slate-400">{timeAgo(a.minutesAgo)}</span>
            </div>
            <p className="mt-1 text-xs text-slate-600">{a.detail}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
