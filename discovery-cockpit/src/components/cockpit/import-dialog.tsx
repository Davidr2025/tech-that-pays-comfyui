"use client";

import { FileUp } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { guessYouLabel, MAX_TRANSCRIPT_CHARS, parseTranscriptDetailed } from "@/lib/transcript";

export interface ImportRequest {
  mode: "paste" | "upload";
  text: string;
  you: string | null;
  swap: boolean;
  fileName?: string;
}

const FORMAT_LABEL = { vtt: "WebVTT captions", srt: "SubRip captions", labeled: "labeled lines", plain: "plain text" } as const;

/** One dialog for the PASTE and UPLOAD sources. Parsing runs here too, so the preview is exactly what the server will store. */
export function ImportDialog({ consultantName, onSubmit, disabled }: { consultantName: string; onSubmit: (req: ImportRequest) => Promise<string | null>; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | undefined>();
  const [you, setYou] = useState<string | null>(null);
  const [swap, setSwap] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const detected = useMemo(() => (text.trim() ? parseTranscriptDetailed(text) : null), [text]);
  const effectiveYou = you ?? (detected?.needsYou ? guessYouLabel(detected.speakers, consultantName) : null);
  const preview = useMemo(() => (text.trim() ? parseTranscriptDetailed(text, { youLabel: effectiveYou, swapRoles: swap }) : null), [text, effectiveYou, swap]);
  const askWho = Boolean(detected && detected.speakers.length >= 2 && detected.needsYou);

  async function chooseFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (file.size > MAX_TRANSCRIPT_CHARS) return setError("That file is too large. Keep transcripts under 2 MB.");
    const content = await file.text();
    if (content.includes("\u0000")) return setError("That doesn't look like a text transcript. Use a .txt, .vtt or .srt file.");
    setText(content);
    setFileName(file.name);
    setYou(null);
    setSwap(false);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const problem = await onSubmit({ mode: fileName ? "upload" : "paste", text, you: effectiveYou, swap, fileName });
    setBusy(false);
    if (problem) setError(problem);
    else {
      setOpen(false);
      setText("");
      setFileName(undefined);
      setYou(null);
      setSwap(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled} data-testid="paste-button">
          <FileUp /> Paste or upload
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogTitle>Paste or upload a transcript</DialogTitle>
        <DialogDescription>
          Paste text, or choose a <code>.txt</code>, <code>.vtt</code> or <code>.srt</code> file (Zoom and Teams transcripts, or anything with <code>Name: text</code> lines). It plays back like a live call.
        </DialogDescription>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => fileInput.current?.click()} data-testid="choose-file">
            <FileUp /> Choose file…
          </Button>
          <input ref={fileInput} type="file" accept=".txt,.vtt,.srt,text/plain,text/vtt" className="sr-only" aria-label="Transcript file" data-testid="file-input" onChange={(e) => void chooseFile(e.target.files?.[0])} />
          {fileName && <span className="text-xs text-muted-foreground" data-testid="file-name">{fileName}</span>}
        </div>
        <Textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setFileName(undefined);
          }}
          rows={10}
          placeholder={"Consultant: Tell me about your business.\nClient: We run a small bakery…"}
          aria-label="Transcript text"
          data-testid="paste-textarea"
        />

        {preview && (
          <div className="space-y-3 rounded-md border bg-muted/40 p-3 text-sm" data-testid="import-summary">
            <p>
              Found <strong>{preview.segments.length}</strong> {preview.segments.length === 1 ? "turn" : "turns"} · {FORMAT_LABEL[preview.format]}
              {detected && detected.speakers.length > 0 ? ` · ${detected.speakers.length} speakers` : ""}
            </p>
            {askWho && detected && (
              <label className="block">
                <span className="mb-1 block font-medium">Which speaker is you?</span>
                <select
                  value={effectiveYou ?? ""}
                  onChange={(e) => setYou(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
                  data-testid="you-select"
                >
                  {detected.speakers.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-muted-foreground">Everyone else is treated as the client.</span>
              </label>
            )}
            {preview.unattributed && (
              <div className="rounded border border-amber-300 bg-amber-50 p-2 text-amber-900" role="note" data-testid="unattributed-warning">
                No speaker names were found, so turns alternate between you and the client, starting with you. Meet and some caption exports leave names out.
                <label className="mt-2 flex items-center gap-2">
                  <input type="checkbox" checked={swap} onChange={(e) => setSwap(e.target.checked)} data-testid="swap-roles" /> It&apos;s backwards. Swap who speaks first.
                </label>
              </div>
            )}
            <ol className="max-h-32 space-y-1 overflow-y-auto text-xs" aria-label="Preview of the first turns">
              {preview.segments.slice(0, 4).map((s, i) => (
                <li key={i} className="truncate">
                  <span className="font-semibold">{s.speaker === "CONSULTANT" ? "You" : "Client"}:</span> {s.text}
                </li>
              ))}
            </ol>
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive" data-testid="import-error">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !preview || preview.segments.length === 0} data-testid="paste-submit">
            {busy ? "Loading…" : "Load & play"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
