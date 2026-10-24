"use client";

import { ClipboardPaste } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export function PasteDialog({ onSubmit, disabled }: { onSubmit: (text: string) => Promise<string | null>; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const problem = await onSubmit(text);
    setBusy(false);
    if (problem) setError(problem);
    else {
      setOpen(false);
      setText("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled} data-testid="paste-button">
          <ClipboardPaste /> Paste transcript
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Paste a transcript</DialogTitle>
        <DialogDescription>
          Label lines with <code>Consultant:</code> and <code>Client:</code> (or <code>Me:</code> / <code>Customer:</code>). With any other names, the
          first speaker is treated as you. With no labels at all, paragraphs alternate starting with you. It plays back like a live call.
        </DialogDescription>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          placeholder={"Consultant: Tell me about your business.\nClient: We run a small bakery…"}
          aria-label="Transcript text"
          data-testid="paste-textarea"
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !text.trim()} data-testid="paste-submit">
            {busy ? "Loading…" : "Load & play"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
