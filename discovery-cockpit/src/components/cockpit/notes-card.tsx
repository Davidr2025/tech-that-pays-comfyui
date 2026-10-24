"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

export const NOTES_SAVE_DELAY_MS = 800;

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * The consultant's private notes on the whole call. Saved shortly after typing stops, on blur,
 * when the card unmounts, and when the page is hidden, so leaving mid-sentence loses nothing.
 */
export function NotesCard({ initial, onSave }: { initial: string; onSave: (text: string, keepalive?: boolean) => Promise<string | null> }) {
  const [text, setText] = useState(initial);
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const saved = useRef(initial);
  const latest = useRef({ text, onSave });
  latest.current = { text, onSave };

  async function save(keepalive = false) {
    const current = latest.current.text;
    if (current.trim() === saved.current.trim()) return;
    setState("saving");
    const err = await latest.current.onSave(current, keepalive);
    if (err) {
      setError(err);
      return setState("error");
    }
    saved.current = current;
    setError(null);
    setState("saved");
  }

  useEffect(() => {
    if (text.trim() === saved.current.trim()) return;
    const t = window.setTimeout(() => void save(), NOTES_SAVE_DELAY_MS);
    return () => window.clearTimeout(t);
    // save() reads through refs, so it is stable here.
  }, [text]);

  useEffect(() => {
    const onHide = () => void save(true);
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      void save(true); // leaving the cockpit with an unsaved edit
    };
  }, []);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          Call notes
          <span className="text-xs font-normal text-muted-foreground" role="status" data-testid="notes-state">
            {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : "Private"}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => void save()}
          rows={4}
          placeholder="Only you see these. They never appear in the client's review."
          aria-label="Private call notes"
          data-testid="call-notes"
        />
        {error && (
          <p role="alert" className="pt-1 text-xs text-destructive" data-testid="notes-error">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
