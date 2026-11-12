"use client";

import { Copy, Radio, Video } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface State {
  linkOn: boolean;
  botOn: boolean;
  botAvailable: boolean;
  path?: string;
}

/**
 * Connects a real meeting to this session. Two ways:
 *   a note-taker bot that joins the Zoom / Meet / Teams call (when the server has a note-taker service), or
 *   a private link any other tool can post transcript lines to.
 * Either way the lines land on the server and the cockpit, now in Live mode, picks them up every couple of seconds.
 */
export function MeetingDialog({ sessionId, disabled, onConnected }: { sessionId: string; disabled: boolean; onConnected: () => void }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [meeting, setMeeting] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void fetch(`/api/sessions/${sessionId}/ingest`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: State | null) => alive && j && setState(j))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [open, sessionId]);

  async function act(body: Record<string, unknown>): Promise<State | null> {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/ingest`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = (await res.json().catch(() => ({}))) as State & { error?: string };
      if (!res.ok) {
        setError(json.error ?? `Request failed (${res.status}).`);
        return null;
      }
      setState(json);
      return json;
    } catch {
      setError("Could not reach the server.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function makeLink() {
    const s = await act({ action: "link" });
    if (s?.path) {
      setUrl(`${window.location.origin}${s.path}`);
      onConnected();
    }
  }
  async function sendBot() {
    const s = await act({ action: "bot", meetingUrl: meeting.trim() });
    if (s?.botOn) {
      setNote("The note-taker is joining. Admit it when the meeting asks, and lines will start to appear here.");
      onConnected();
    }
  }
  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setNote("Copied.");
    } catch {
      setNote("Select the link and copy it.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled} data-testid="meeting-button">
          <Video /> Connect meeting
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogTitle>Connect a live meeting</DialogTitle>
        <DialogDescription>
          Transcript lines from your Zoom, Google Meet or Teams call arrive here as they are spoken. Tell your client the call is being transcribed before you start.
        </DialogDescription>

        <section className="space-y-2 rounded-md border p-3" data-testid="meeting-bot">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Radio className="size-4" /> Send a note-taker to the call
          </h3>
          {state?.botAvailable ? (
            state.botOn ? (
              <div className="space-y-2 text-sm">
                <p>A note-taker is in (or joining) the call for this session.</p>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void act({ action: "bot-leave" })} data-testid="bot-leave">
                  Remove the note-taker
                </Button>
              </div>
            ) : (
              <form
                className="flex flex-wrap gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendBot();
                }}
              >
                <Input className="min-w-0 flex-1" value={meeting} onChange={(e) => setMeeting(e.target.value)} placeholder="https://zoom.us/j/… or https://meet.google.com/…" aria-label="Meeting link" data-testid="meeting-url" />
                <Button type="submit" size="sm" disabled={busy || !meeting.trim()} data-testid="bot-send">
                  Send
                </Button>
              </form>
            )
          ) : (
            <p className="text-sm text-muted-foreground">
              Not set up on this server. It needs a Recall.ai key (<code>RECALL_API_KEY</code>) and a public address. Until then, use the link below or Type live.
            </p>
          )}
        </section>

        <section className="space-y-2 rounded-md border p-3" data-testid="meeting-link">
          <h3 className="text-sm font-semibold">Or give another tool a private link</h3>
          <p className="text-sm text-muted-foreground">
            Any tool that can send a web request can post lines as JSON: <code>{'{"speaker":"client","text":"…"}'}</code>. Use <code>consultant</code> or <code>client</code>, or a person&apos;s name.
          </p>
          {url ? (
            <div className="space-y-2">
              <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Private ingest link" data-testid="ingest-url" />
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => void copy()}>
                  <Copy /> Copy
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void act({ action: "off" }).then((s) => s && setUrl(null))}
                  data-testid="ingest-off"
                >
                  Turn it off
                </Button>
                <span className="text-xs text-muted-foreground">Shown once. Anyone with it can add lines to this session, so treat it like a password.</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void makeLink()} data-testid="ingest-create">
                {state?.linkOn ? "Replace the link" : "Create the link"}
              </Button>
              {state?.linkOn && (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act({ action: "off" })} data-testid="ingest-off">
                  Turn it off
                </Button>
              )}
              {state?.linkOn && <span className="text-xs text-muted-foreground">A link is active. It is only shown when created.</span>}
            </div>
          )}
        </section>

        {error && (
          <p role="alert" className="text-sm text-destructive" data-testid="meeting-error">
            {error}
          </p>
        )}
        {note && (
          <p role="status" className="text-sm text-muted-foreground" data-testid="meeting-note">
            {note}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
