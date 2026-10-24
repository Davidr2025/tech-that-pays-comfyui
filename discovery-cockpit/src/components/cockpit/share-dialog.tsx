"use client";

import { CalendarPlus, Copy, FileDown, Link2, Mail, Send, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { mailtoProvider } from "@/lib/email";
import type { ShareKit } from "@/server/share";

const DURATIONS = [15, 30, 45, 60, 90];

/** Consultant-side tools for sending the finished review. Built from the client-safe payload only. */
export function ShareDialog({ sessionId, prototypePath }: { sessionId: string; prototypePath: string | null }) {
  const [open, setOpen] = useState(false);
  const [kit, setKit] = useState<ShareKit | null>(null);
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [mailHref, setMailHref] = useState<string | null>(null);

  // Sending from the app (only when the server has SMTP).
  const [attachPdf, setAttachPdf] = useState(false);
  const [when, setWhen] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);

  // The provider turns the prepared message into something the browser can open (a mailto: link today).
  useEffect(() => {
    if (!kit) return setMailHref(null);
    let live = true;
    void mailtoProvider.deliver({ to: to.trim() || null, ...kit.email }).then((d) => {
      if (live && d.kind === "compose") setMailHref(d.href);
    });
    return () => {
      live = false;
    };
  }, [kit, to]);

  async function load() {
    setKit(null);
    setError(null);
    setMessage(null);
    setConfirming(false);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/share`);
      const json = (await res.json()) as ShareKit & { error?: string };
      if (!res.ok) return setError(json.error ?? "Could not prepare the share options.");
      setKit(json);
      setTo(json.to ?? "");
      setAttachPdf(json.capabilities.pdf);
    } catch {
      setError("Could not reach the server.");
    }
  }

  async function copy(label: string, text: string, html?: string) {
    try {
      if (html && typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) })]);
      } else {
        await navigator.clipboard.writeText(html ?? text);
      }
      setMessage(`${label} copied.`);
    } catch {
      setMessage("Your browser blocked copying. Allow clipboard access for this page and try again.");
    }
  }

  /** The proposed time as an ISO string, or null when none is chosen (or it is not a real date). */
  const proposed = (() => {
    if (!when) return null;
    const d = new Date(when);
    return Number.isNaN(d.getTime()) ? null : { start: d.toISOString(), minutes };
  })();

  async function download(url: string, fallbackName: string) {
    setMessage(null);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        return setMessage(json.error ?? "Could not make that file.");
      }
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? fallbackName;
      const href = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement("a"), { href, download: name });
      document.body.append(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
      setMessage(`${name} downloaded.`);
    } catch {
      setMessage("Could not reach the server.");
    }
  }

  async function send() {
    setSending(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attachPdf, ...(proposed ? { invite: proposed } : {}) }),
      });
      const json = (await res.json().catch(() => ({}))) as { to?: string; sentAt?: string; error?: string };
      if (!res.ok) setMessage(json.error ?? "Could not send the email.");
      else {
        setMessage(`Sent to ${json.to}.`);
        setKit((k) => (k ? { ...k, lastSent: { to: json.to!, at: json.sentAt! } } : k));
      }
    } catch {
      setMessage("Could not reach the server.");
    }
    setSending(false);
    setConfirming(false);
  }

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const local = /^(localhost|127\.|\[::1\])/.test(typeof window === "undefined" ? "" : window.location.hostname);
  const inviteHref = proposed ? `/api/sessions/${sessionId}/invite?start=${encodeURIComponent(proposed.start)}&minutes=${proposed.minutes}` : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) void load();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="share-button">
          <Share2 /> Share
        </Button>
      </DialogTrigger>
      <DialogContent data-testid="share-dialog" className="max-h-[90vh] overflow-y-auto">
        <DialogTitle>Share the review</DialogTitle>
        <DialogDescription>Everything here is built from the client-safe review. Nothing private is included.</DialogDescription>
        {error && (
          <p role="alert" className="text-sm text-destructive" data-testid="share-error">
            {error}
          </p>
        )}
        {!kit && !error && <p className="text-sm text-muted-foreground">Preparing…</p>}
        {kit && (
          <div className="space-y-5">
            <section className="space-y-2" aria-label="Email">
              <label htmlFor="share-to" className="text-sm font-medium">
                Email to
              </label>
              <div className="flex gap-2">
                <Input id="share-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="client@example.com" />
                <Button asChild variant={kit.capabilities.smtp ? "outline" : "default"}>
                  <a href={mailHref ?? undefined} data-testid="share-email" onClick={() => setMessage("Opened a draft in your email app. Attach the PDF yourself: a mail link cannot attach files.")}>
                    <Mail /> Open draft
                  </a>
                </Button>
              </div>
            </section>

            <section className="space-y-3 rounded-md border p-3" aria-label="Follow-up meeting">
              <p className="text-sm font-medium">Propose a follow-up time (optional)</p>
              <div className="flex flex-wrap items-center gap-2">
                <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="w-auto" aria-label="Follow-up date and time" data-testid="invite-when" />
                <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} aria-label="Length" className="h-9 rounded-md border border-input bg-card px-2 text-sm" data-testid="invite-minutes">
                  {DURATIONS.map((m) => (
                    <option key={m} value={m}>
                      {m} min
                    </option>
                  ))}
                </select>
                {inviteHref && (
                  <Button type="button" variant="outline" size="sm" onClick={() => void download(inviteHref, "invite.ics")} data-testid="invite-download">
                    <CalendarPlus /> Download invite
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">A calendar invitation (.ics) that invites the client by email. It works in Google Calendar, Outlook and Apple Calendar.</p>
            </section>

            {kit.capabilities.smtp && (
              <section className="space-y-3 rounded-md border border-primary/40 p-3" aria-label="Send from the app" data-testid="send-section">
                <p className="text-sm font-medium">Send it from here</p>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1 size-4" checked={attachPdf} disabled={!kit.capabilities.pdf} onChange={(e) => setAttachPdf(e.target.checked)} data-testid="attach-pdf" />
                  <span>
                    Attach the review as a PDF
                    {!kit.capabilities.pdf && <span className="block text-xs text-muted-foreground">PDF files need Chromium on this server, which is not set up.</span>}
                  </span>
                </label>
                {!kit.to ? (
                  <p className="text-xs text-muted-foreground" data-testid="no-client-email">
                    Add an email address to this client first. The app only sends to the address on the client&apos;s record.
                  </p>
                ) : confirming ? (
                  <div className="space-y-2" data-testid="send-confirm">
                    <p className="text-sm">
                      Email the summary{attachPdf ? ", the PDF" : ""}
                      {proposed ? " and a calendar invitation" : ""} to <strong>{kit.to}</strong> now?
                    </p>
                    <div className="flex gap-2">
                      <Button type="button" onClick={() => void send()} disabled={sending} data-testid="send-confirm-button">
                        <Send /> {sending ? "Sending…" : "Yes, send it"}
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => setConfirming(false)} disabled={sending}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button type="button" onClick={() => setConfirming(true)} data-testid="send-button">
                    <Send /> Send to client
                  </Button>
                )}
                {kit.lastSent && (
                  <p className="text-xs text-muted-foreground" data-testid="last-sent">
                    Last sent to {kit.lastSent.to} on {new Date(kit.lastSent.at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}.
                  </p>
                )}
              </section>
            )}

            <section className="flex flex-wrap gap-2" aria-label="Copy and download">
              <Button type="button" variant="outline" onClick={() => void copy("Formatted version", kit.text, kit.html)} data-testid="share-gamma">
                <Copy /> Copy for Gamma
              </Button>
              <Button type="button" variant="outline" onClick={() => void copy("Plain text", kit.text)} data-testid="share-text">
                <Copy /> Copy as text
              </Button>
              <Button type="button" variant="outline" onClick={() => void copy("Link", `${origin}/reveal/${sessionId}`)} data-testid="share-link">
                <Link2 /> Copy link
              </Button>
              <Button asChild variant="outline">
                <a href={`/reveal/${sessionId}?print=1`} target="_blank" rel="noreferrer" data-testid="share-pdf">
                  <FileDown /> Review PDF
                </a>
              </Button>
              {prototypePath && (
                <Button asChild variant="outline">
                  <a href={`${prototypePath}?print=1`} target="_blank" rel="noreferrer" data-testid="share-prototype-pdf">
                    <FileDown /> Prototype PDF
                  </a>
                </Button>
              )}
              {kit.capabilities.pdf && (
                <>
                  <Button type="button" variant="outline" onClick={() => void download(`/api/sessions/${sessionId}/pdf?doc=review`, "review.pdf")} data-testid="download-review-pdf">
                    <FileDown /> Download review file
                  </Button>
                  {prototypePath && (
                    <Button type="button" variant="outline" onClick={() => void download(`/api/sessions/${sessionId}/pdf?doc=prototype`, "prototype.pdf")} data-testid="download-prototype-pdf">
                      <FileDown /> Download prototype file
                    </Button>
                  )}
                </>
              )}
            </section>
            {local && <p className="text-xs text-muted-foreground">This app is running on your computer, so a copied link only works for you. Send the PDF or the email text instead.</p>}
            {message && (
              <p role="status" className="text-sm text-emerald-700" data-testid="share-message">
                {message}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
