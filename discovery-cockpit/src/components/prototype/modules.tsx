"use client";

import { Check, CircleDot, FileBarChart, Pencil, Plus, Trash2, Undo2, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/format";
import type { PrototypeEdit } from "@/lib/prototype/edit";
import { financeProvenance, type ContentData, type FinanceData, type NurtureData, type SecurityData } from "@/lib/prototype/schema";
import { cn } from "@/lib/utils";

/** One change the owner can make; the parent adds the module id. Resolves with an error message, or null on success. */
export type EditOp = PrototypeEdit extends infer E ? (E extends { moduleId: string } ? Omit<E, "moduleId"> : never) : never;
export interface ModuleProps<T> {
  data: T;
  /** True only for the signed-in owner (or in local mode). Everyone else sees a read-only prototype. */
  canEdit: boolean;
  edit: (op: EditOp) => Promise<string | null>;
}

function Problem({ text }: { text: string | null }) {
  return text ? (
    <p role="alert" className="mt-2 text-xs text-red-700" data-testid="edit-error">
      {text}
    </p>
  ) : null;
}

const without = <T,>(obj: Record<string, T>, key: string): Record<string, T> => Object.fromEntries(Object.entries(obj).filter(([k]) => k !== key));

/** Runs an edit, tracking whether it is in flight and what went wrong. */
function useEdit(edit: ModuleProps<unknown>["edit"]) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(op: EditOp): Promise<boolean> {
    setBusy(true);
    setError(null);
    const err = await edit(op);
    setBusy(false);
    setError(err);
    return err === null;
  }
  return { busy, error, run };
}

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

export function NurtureModule({ data, canEdit, edit }: ModuleProps<NurtureData>) {
  const [open, setOpen] = useState<string | null>(data.contacts[0]?.id ?? null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ label: "", stage: "", temperature: "warm" as "hot" | "warm" | "cold", days: "7", nextAction: "" });
  const { busy, error, run } = useEdit(edit);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const ok = await run({ op: "contact.add", label: form.label, stage: form.stage, temperature: form.temperature, daysSinceContact: Math.round(Number(form.days)), nextAction: form.nextAction });
    if (ok) {
      setForm({ label: "", stage: "", temperature: "warm", days: "7", nextAction: "" });
      setAdding(false);
    }
  }

  return (
    <div>
      <Intro text={data.summary} />
      {data.contacts.length === 0 && <p className="rounded-md border border-dashed p-3 text-sm text-slate-500">No contacts yet.</p>}
      <ul className="divide-y rounded-md border" data-testid="nurture-list" hidden={data.contacts.length === 0}>
        {data.contacts.map((c) => {
          const t = TEMP[c.temperature];
          const expanded = open === c.id;
          return (
            <li key={c.id} className="avoid-break" data-example={c.example}>
              <div className="flex items-center">
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setOpen(expanded ? null : c.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50"
                  data-testid="nurture-row"
                >
                  <span className={cn("size-2.5 shrink-0 rounded-full", t.dot)} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{c.label}</span>
                    <span className="block text-xs text-slate-500">
                      {c.stage ? `${c.stage} · ` : ""}
                      {c.daysSinceContact} {c.daysSinceContact === 1 ? "day" : "days"} since contact
                    </span>
                  </span>
                  <span className={cn("text-xs font-semibold", t.text)}>{t.label}</span>
                  {c.example && <ExampleBadge />}
                </button>
                {canEdit && (
                  <Button variant="ghost" size="icon" className="mr-1 size-8 text-slate-400 print:hidden" aria-label={`Remove ${c.label}`} disabled={busy} onClick={() => void run({ op: "contact.remove", contactId: c.id })} data-testid="contact-remove">
                    <Trash2 />
                  </Button>
                )}
              </div>
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
      {canEdit && (
        <div className="mt-3 print:hidden">
          {adding ? (
            <form onSubmit={add} className="space-y-2 rounded-md border p-3" data-testid="contact-form">
              <p className="text-xs text-slate-500">Add a real contact from this client&apos;s records. It is shown without an Example label.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Name or description" aria-label="Contact name" data-testid="contact-label" required />
                <Input value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })} placeholder="Stage, e.g. Proposal sent" aria-label="Stage" />
                <select value={form.temperature} onChange={(e) => setForm({ ...form, temperature: e.target.value as typeof form.temperature })} aria-label="Urgency" className="h-9 rounded-md border border-input bg-card px-2 text-sm" data-testid="contact-temp">
                  <option value="hot">Hot</option>
                  <option value="warm">Warm</option>
                  <option value="cold">Cold</option>
                </select>
                <Input type="number" min={0} max={3650} value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} aria-label="Days since contact" data-testid="contact-days" />
              </div>
              <Input value={form.nextAction} onChange={(e) => setForm({ ...form, nextAction: e.target.value })} placeholder="Suggested next action" aria-label="Next action" data-testid="contact-action" required />
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={busy} data-testid="contact-save">
                  Add contact
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)} data-testid="contact-add">
              <Plus /> Add a contact
            </Button>
          )}
        </div>
      )}
      <Problem text={error} />
      <ul className="mt-3 space-y-1 text-xs text-slate-500">
        {data.basis.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
    </div>
  );
}

// ---------- Content Studio ----------

export function ContentModule({ data, canEdit, edit }: ModuleProps<ContentData>) {
  // Only the text being typed is local; a draft's status and saved wording live in the data.
  const [editing, setEditing] = useState<Record<string, string>>({});
  const { busy, error, run } = useEdit(edit);
  const approved = data.drafts.filter((d) => d.status === "approved").length;

  async function save(id: string) {
    if (await run({ op: "draft", draftId: id, body: editing[id] ?? "" })) {
      setEditing((e) => without(e, id));
    }
  }

  return (
    <div>
      <Intro text={data.summary} />
      <p className="mb-3 rounded-md bg-slate-50 p-2.5 text-xs text-slate-600">
        <span className="font-semibold">Voice:</span> {data.voice}
      </p>
      <ul className="space-y-3" data-testid="content-list">
        {data.drafts.map((d) => {
          const isEditing = d.id in editing;
          return (
            <li key={d.id} className="avoid-break rounded-md border p-3" data-testid="draft" data-status={d.status}>
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{d.topic}</span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{d.channel}</span>
                <ExampleBadge>Example draft</ExampleBadge>
                {d.edited && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">Edited</span>}
                <span
                  className={cn("ml-auto text-xs font-medium", d.status === "approved" && "text-emerald-700", d.status === "rejected" && "text-slate-400 line-through", d.status === "pending" && "text-slate-500")}
                  data-testid="draft-status"
                >
                  {d.status === "approved" ? "Approved, ready to publish" : d.status === "rejected" ? "Rejected" : "Waiting for your review"}
                </span>
              </div>
              {isEditing ? (
                <Textarea value={editing[d.id]} onChange={(e) => setEditing({ ...editing, [d.id]: e.target.value })} rows={6} aria-label={`Edit draft: ${d.topic}`} data-testid="draft-editor" />
              ) : (
                <p className={cn("whitespace-pre-line text-sm leading-relaxed", d.status === "rejected" && "text-slate-400")}>{d.body}</p>
              )}
              {canEdit && (
                <div className="mt-2.5 flex flex-wrap gap-2 print:hidden">
                  {isEditing ? (
                    <>
                      <Button size="sm" disabled={busy} onClick={() => void save(d.id)} data-testid="draft-save">
                        <Check /> Save edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing((e) => without(e, d.id))}>
                        Cancel
                      </Button>
                    </>
                  ) : d.status === "pending" ? (
                    <>
                      <Button size="sm" disabled={busy} onClick={() => void run({ op: "draft", draftId: d.id, status: "approved" })} data-testid="draft-approve">
                        <Check /> Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditing({ ...editing, [d.id]: d.body })} data-testid="draft-edit">
                        <Pencil /> Edit
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run({ op: "draft", draftId: d.id, status: "rejected" })} data-testid="draft-reject">
                        <X /> Reject
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run({ op: "draft", draftId: d.id, status: "pending" })} data-testid="draft-undo">
                      <Undo2 /> Back to review
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <Problem text={error} />
      <p className="mt-3 text-xs text-slate-500" data-testid="content-count">
        {approved} of {data.drafts.length} approved. Nothing is published until a person approves it.
      </p>
    </div>
  );
}

// ---------- Financial Pulse ----------

export function FinanceModule({ data, canEdit, edit }: ModuleProps<FinanceData>) {
  const [reportOpen, setReportOpen] = useState(false);
  const [generatedAt, setGeneratedAt] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [figures, setFigures] = useState<Record<string, { actual: string; budget: string }>>({});
  const { busy, error, run } = useEdit(edit);

  function openEditor() {
    setFigures(Object.fromEntries(data.lines.map((l) => [l.key, { actual: String(l.actual), budget: String(l.budget) }])));
    setEditOpen(true);
  }
  async function saveFigures(e: React.FormEvent) {
    e.preventDefault();
    const ok = await run({ op: "finance", lines: data.lines.map((l) => ({ key: l.key, actual: Number(figures[l.key]?.actual), budget: Number(figures[l.key]?.budget) })) });
    if (ok) setEditOpen(false);
  }
  return (
    <div>
      <Intro text={data.summary} />
      <p className="-mt-2 mb-3 text-xs text-slate-500" data-testid="finance-provenance">
        {financeProvenance(data.lines)}
      </p>
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
                {l.source === "stated" ? (
                  <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800">From your call</span>
                ) : l.source === "entered" ? (
                  <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-800" data-testid="entered-badge">
                    Entered
                  </span>
                ) : (
                  <ExampleBadge />
                )}
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
        {canEdit && (
          <Button size="sm" variant="outline" className="print:hidden" onClick={openEditor} data-testid="finance-edit">
            <Pencil /> Enter figures
          </Button>
        )}
        <span className="text-xs text-slate-500">{data.note}</span>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent data-testid="finance-dialog">
          <DialogTitle>Enter figures</DialogTitle>
          <DialogDescription>Type this client&apos;s real figures for the period. Bars and remaining amounts are worked out from them. Entered lines are labelled Entered.</DialogDescription>
          <form onSubmit={saveFigures} className="space-y-3">
            <div className="grid grid-cols-[1fr_1fr_1fr] items-center gap-2 text-xs font-medium text-slate-500">
              <span>Line</span>
              <span>Actual ($)</span>
              <span>Budget ($)</span>
            </div>
            {data.lines.map((l) => (
              <div key={l.key} className="grid grid-cols-[1fr_1fr_1fr] items-center gap-2">
                <span className="text-sm">{l.label}</span>
                <Input type="number" min={0} step="any" value={figures[l.key]?.actual ?? ""} onChange={(e) => setFigures({ ...figures, [l.key]: { ...figures[l.key]!, actual: e.target.value } })} aria-label={`${l.label} actual`} data-testid={`fin-actual-${l.key}`} required />
                <Input type="number" min={0} step="any" value={figures[l.key]?.budget ?? ""} onChange={(e) => setFigures({ ...figures, [l.key]: { ...figures[l.key]!, budget: e.target.value } })} aria-label={`${l.label} budget`} data-testid={`fin-budget-${l.key}`} required />
              </div>
            ))}
            <Problem text={error} />
            <Button type="submit" disabled={busy} data-testid="finance-save">
              Save figures
            </Button>
          </form>
        </DialogContent>
      </Dialog>

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

export function SecurityModule({ data, canEdit, edit }: ModuleProps<SecurityData>) {
  const [filter, setFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ severity: "medium" as "low" | "medium" | "high", title: "", detail: "", tool: "" });
  const { busy, error, run } = useEdit(edit);
  const shown = filter === "all" ? data.feed : data.feed.filter((a) => a.severity === filter);
  const count = (level: "high" | "medium" | "low") => data.feed.filter((a) => a.severity === level).length;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (await run({ op: "alert.add", severity: form.severity, title: form.title, detail: form.detail, tool: form.tool || null })) {
      setForm({ severity: "medium", title: "", detail: "", tool: "" });
      setAdding(false);
    }
  }

  return (
    <div>
      <Intro text={data.summary} />
      <p className="mb-2 flex items-center gap-1.5 text-xs text-slate-500">
        <CircleDot className="size-3.5 animate-pulse text-emerald-600" aria-hidden /> Monitoring · example feed
      </p>
      <div className="mb-2 flex flex-wrap gap-1.5 print:hidden" role="group" aria-label="Filter alerts by severity">
        {(["all", "high", "medium", "low"] as const).map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            data-testid={`sev-filter-${f}`}
            className={cn("rounded-full border px-2.5 py-0.5 text-xs", filter === f ? "border-slate-800 bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50")}
          >
            {f === "all" ? `All (${data.feed.length})` : `${SEV[f].label} (${count(f)})`}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="rounded-md border border-dashed p-3 text-sm text-slate-500" data-testid="security-empty">
          {data.feed.length === 0 ? "No alerts." : "No alerts at this severity."}
        </p>
      ) : (
        <ul className="divide-y rounded-md border" data-testid="security-feed">
          {shown.map((a) => (
            <li key={a.id} className="avoid-break px-3 py-2.5" data-testid="alert" data-level={a.severity}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("rounded border px-1.5 py-0.5 text-[11px] font-semibold", SEV[a.severity].cls)}>{SEV[a.severity].label}</span>
                <span className="text-sm font-medium">{a.title}</span>
                <ExampleBadge />
                <span className="ml-auto text-xs text-slate-400">{timeAgo(a.minutesAgo)}</span>
                {canEdit && (
                  <Button variant="ghost" size="icon" className="size-7 text-slate-400 print:hidden" aria-label={`Remove alert: ${a.title}`} disabled={busy} onClick={() => void run({ op: "alert.remove", alertId: a.id })} data-testid="alert-remove">
                    <Trash2 />
                  </Button>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-600">{a.detail}</p>
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div className="mt-3 print:hidden">
          {adding ? (
            <form onSubmit={add} className="space-y-2 rounded-md border p-3" data-testid="alert-form">
              <p className="text-xs text-slate-500">An alert you add is part of the demonstration, so it carries the Example label like the rest.</p>
              <div className="grid gap-2 sm:grid-cols-[8rem_1fr]">
                <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value as typeof form.severity })} aria-label="Severity" className="h-9 rounded-md border border-input bg-card px-2 text-sm" data-testid="alert-severity">
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="What happened" aria-label="Alert title" data-testid="alert-title" required />
              </div>
              <Input value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} placeholder="Detail (optional)" aria-label="Alert detail" />
              <Input value={form.tool} onChange={(e) => setForm({ ...form, tool: e.target.value })} placeholder="Tool involved (optional)" aria-label="Tool" />
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={busy} data-testid="alert-save">
                  Add alert
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)} data-testid="alert-add">
              <Plus /> Add an alert
            </Button>
          )}
        </div>
      )}
      <Problem text={error} />
    </div>
  );
}
