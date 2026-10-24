"use client";

import { Bot, ChevronDown, Pencil, Plus, StickyNote, Trash2 } from "lucide-react";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";

export interface QuestionRow {
  id: string;
  topic: string;
  text: string;
  checked: boolean;
  /** Checked because the engine detected the topic, not because the consultant ticked it. */
  byAI: boolean;
  /** The consultant's private note. */
  notes: string;
  /** A question the consultant added; only ever ticked by hand. */
  custom: boolean;
}

/** Combined assessments mix two banks; headings keep 40 questions scannable. */
function groupOf(topic: string | undefined): string | null {
  if (!topic) return null;
  if (topic.startsWith("ops_")) return "Operations";
  if (topic.startsWith("tech_")) return "Technology";
  return null;
}

interface Actions {
  onToggle: (row: QuestionRow) => void;
  /** Resolve with an error message to show, or null on success. */
  onEdit: (row: QuestionRow, text: string) => Promise<string | null>;
  onNotes: (row: QuestionRow, notes: string) => Promise<string | null>;
  onDelete: (row: QuestionRow) => Promise<string | null>;
  /** Structure (wording, add, delete) is frozen once the session is complete. */
  locked: boolean;
}

/**
 * Everything a row is in the middle of (an open note, unsaved text, a wording edit, a pending
 * delete) lives in the panel, not the row: a row moves between "Not yet asked" and "Covered"
 * when a topic is detected, which remounts it, and typing must survive that.
 */
interface Ui {
  notesOpen: boolean;
  noteDraft: string | undefined;
  wordingDraft: string | undefined;
  confirming: boolean;
  error: string | null;
}
const IDLE: Ui = { notesOpen: false, noteDraft: undefined, wordingDraft: undefined, confirming: false, error: null };

interface RowHandlers extends Actions {
  ui: (id: string) => Ui;
  patch: (id: string, change: Partial<Ui>) => void;
  flushNote: (row: QuestionRow) => void;
  saveWording: (row: QuestionRow) => void;
  remove: (row: QuestionRow) => void;
}

const iconBtn = "size-7 shrink-0 text-muted-foreground";
const reveal = "opacity-0 focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100";

function Row({ row, ...h }: RowHandlers & { row: QuestionRow }) {
  const ui = h.ui(row.id);
  const editing = ui.wordingDraft !== undefined;
  const notes = ui.noteDraft ?? row.notes;

  return (
    <li data-testid="question-row" data-topic={row.topic} data-checked={row.checked} data-ai={row.byAI} data-custom={row.custom}>
      <div className="group flex items-start gap-1 rounded-md hover:bg-muted">
        {editing ? (
          <div className="flex flex-1 items-center gap-1.5 p-2">
            <Input
              value={ui.wordingDraft}
              onChange={(e) => h.patch(row.id, { wordingDraft: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") h.saveWording(row);
                if (e.key === "Escape") h.patch(row.id, { wordingDraft: undefined, error: null });
              }}
              aria-label="Question wording"
              data-testid="question-edit-input"
              autoFocus
            />
            <Button size="sm" onClick={() => h.saveWording(row)} data-testid="question-edit-save">
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => h.patch(row.id, { wordingDraft: undefined, error: null })}>
              Cancel
            </Button>
          </div>
        ) : (
          <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5 p-2">
            <Checkbox className="mt-0.5" checked={row.checked} onCheckedChange={() => h.onToggle(row)} aria-label={row.text} />
            <span className="flex-1 text-sm leading-snug">
              <span className={row.checked ? "text-muted-foreground line-through decoration-muted-foreground/40" : undefined}>{row.text}</span>
              {row.byAI && (
                <Badge variant="ai" className="ml-2 align-middle" data-testid="ai-badge">
                  <Bot className="mr-1 size-3" /> AI-detected
                </Badge>
              )}
              {row.custom && (
                <Badge variant="outline" className="ml-2 align-middle" data-testid="custom-badge">
                  Yours
                </Badge>
              )}
            </span>
          </label>
        )}
        {!editing && (
          <div className="flex shrink-0 items-center pr-1 pt-1">
            <Button
              variant="ghost"
              size="icon"
              className={`${iconBtn} ${notes ? "text-primary" : reveal}`}
              aria-label={ui.notesOpen ? "Hide note" : notes ? "Show note" : "Add a note"}
              aria-expanded={ui.notesOpen}
              onClick={() => h.patch(row.id, { notesOpen: !ui.notesOpen })}
              data-testid="question-notes-toggle"
            >
              <StickyNote />
            </Button>
            {!h.locked && !ui.confirming && (
              <>
                <Button variant="ghost" size="icon" className={`${iconBtn} ${reveal}`} aria-label="Edit question" onClick={() => h.patch(row.id, { wordingDraft: row.text })} data-testid="question-edit">
                  <Pencil />
                </Button>
                <Button variant="ghost" size="icon" className={`${iconBtn} ${reveal}`} aria-label="Delete question" onClick={() => h.patch(row.id, { confirming: true })} data-testid="question-delete">
                  <Trash2 />
                </Button>
              </>
            )}
            {ui.confirming && (
              <span className="flex items-center gap-1 pl-1 text-xs">
                Delete?
                <Button size="sm" variant="destructive" className="h-6 px-2" onClick={() => h.remove(row)} data-testid="question-delete-confirm">
                  Yes
                </Button>
                <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => h.patch(row.id, { confirming: false })}>
                  No
                </Button>
              </span>
            )}
          </div>
        )}
      </div>
      {ui.notesOpen && (
        <div className="px-2 pb-2 pl-9">
          <Textarea
            value={notes}
            onChange={(e) => h.patch(row.id, { noteDraft: e.target.value })}
            onBlur={() => h.flushNote(row)}
            placeholder="Private note. The client never sees this."
            rows={2}
            aria-label={`Private note for: ${row.text}`}
            data-testid="question-notes"
          />
        </div>
      )}
      {ui.error && (
        <p role="alert" className="px-2 pb-1 pl-9 text-xs text-destructive" data-testid="question-error">
          {ui.error}
        </p>
      )}
    </li>
  );
}

function Section({ title, testid, rows, empty, handlers }: { title: string; testid: string; rows: QuestionRow[]; empty?: string; handlers: RowHandlers }) {
  return (
    <details open className="group/section" data-testid={testid}>
      <summary className="flex cursor-pointer list-none items-center gap-1.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground" data-testid={`${testid}-toggle`}>
        <ChevronDown className="size-3.5 [details:not([open])_&]:-rotate-90" />
        {title} ({rows.length})
      </summary>
      {rows.length === 0 && empty ? (
        <p className="px-2 py-1 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((row, i) => (
            <Fragment key={row.id}>
              {groupOf(row.topic) !== groupOf(rows[i - 1]?.topic) && groupOf(row.topic) && (
                <li className="px-2 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground first:pt-0" data-testid="question-group">
                  {groupOf(row.topic)}
                </li>
              )}
              <Row row={row} {...handlers} />
            </Fragment>
          ))}
        </ul>
      )}
    </details>
  );
}

/** A note is saved this long after the last keystroke, and immediately on blur. */
const NOTE_SAVE_DELAY_MS = 700;

export function QuestionPanel({ rows, onAdd, ...actions }: Actions & { rows: QuestionRow[]; onAdd: (text: string) => Promise<string | null> }) {
  const covered = rows.filter((r) => r.checked);
  const open = rows.filter((r) => !r.checked);
  const [draft, setDraft] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const [uiById, setUiById] = useState<Record<string, Ui>>({});
  const ui = useCallback((id: string) => uiById[id] ?? IDLE, [uiById]);
  const patch = useCallback((id: string, change: Partial<Ui>) => setUiById((m) => ({ ...m, [id]: { ...(m[id] ?? IDLE), ...change } })), []);

  // Callbacks that outlive a render read the latest rows and handlers through a ref.
  const latest = useRef({ rows, actions, uiById });
  latest.current = { rows, actions, uiById };

  const saveNote = useCallback(
    async (id: string) => {
      const { rows: current, actions: a, uiById: u } = latest.current;
      const row = current.find((r) => r.id === id);
      const text = u[id]?.noteDraft;
      if (!row || text === undefined) return;
      if (text.trim() === row.notes.trim()) return patch(id, { noteDraft: undefined });
      const err = await a.onNotes(row, text);
      // Keep the draft if the save failed, so nothing typed is lost.
      patch(id, err ? { error: err } : { noteDraft: undefined, error: null });
    },
    [patch],
  );

  // Debounced autosave. Keyed on the drafts only: the rows change on every played segment and would restart the timer forever.
  const draftKey = JSON.stringify(Object.entries(uiById).map(([id, u]) => [id, u.noteDraft]));
  useEffect(() => {
    const timers = Object.entries(latest.current.uiById)
      .filter(([, u]) => u.noteDraft !== undefined)
      .map(([id]) => window.setTimeout(() => void saveNote(id), NOTE_SAVE_DELAY_MS));
    return () => timers.forEach(window.clearTimeout);
  }, [draftKey, saveNote]);

  const handlers: RowHandlers = {
    ...actions,
    ui,
    patch,
    flushNote: (row) => void saveNote(row.id),
    saveWording: (row) => {
      const text = latest.current.uiById[row.id]?.wordingDraft;
      if (text === undefined) return;
      void actions.onEdit(row, text).then((err) => patch(row.id, err ? { error: err } : { wordingDraft: undefined, error: null }));
    },
    remove: (row) => void actions.onDelete(row).then((err) => patch(row.id, err ? { error: err, confirming: false } : IDLE)),
  };

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const err = await onAdd(draft);
    setAddError(err);
    if (!err) setDraft("");
  }

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle>Discovery questions</CardTitle>
        <div className="pt-1">
          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
            <span data-testid="question-progress">
              {covered.length} of {rows.length} covered
            </span>
            <span>{rows.length ? Math.round((covered.length / rows.length) * 100) : 0}%</span>
          </div>
          <Progress value={rows.length ? (covered.length / rows.length) * 100 : 0} aria-label="Questions covered" />
        </div>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        <Section title="Not yet asked" testid="not-asked" rows={open} empty="Everything on the list is covered." handlers={handlers} />
        {covered.length > 0 && <Section title="Covered" testid="covered" rows={covered} handlers={handlers} />}
        {!actions.locked && (
          <form onSubmit={add} className="flex items-start gap-2 border-t pt-3">
            <div className="flex-1">
              <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a question of your own" aria-label="New question" data-testid="add-question-input" />
              {addError && (
                <p role="alert" className="pt-1 text-xs text-destructive" data-testid="add-question-error">
                  {addError}
                </p>
              )}
            </div>
            <Button type="submit" variant="outline" disabled={!draft.trim()} data-testid="add-question">
              <Plus /> Add
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
