"use client";

import { Copy, FileDown, Link2, Mail, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { mailtoProvider } from "@/lib/email";
import type { ShareKit } from "@/server/share";

/** Consultant-side tools for sending the finished review. Built from the client-safe payload only. */
export function ShareDialog({ sessionId, prototypePath }: { sessionId: string; prototypePath: string | null }) {
  const [open, setOpen] = useState(false);
  const [kit, setKit] = useState<ShareKit | null>(null);
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [mailHref, setMailHref] = useState<string | null>(null);

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
    try {
      const res = await fetch(`/api/sessions/${sessionId}/share`);
      const json = (await res.json()) as ShareKit & { error?: string };
      if (!res.ok) return setError(json.error ?? "Could not prepare the share options.");
      setKit(json);
      setTo(json.to ?? "");
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

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const local = /^(localhost|127\.|\[::1\])/.test(typeof window === "undefined" ? "" : window.location.hostname);

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
      <DialogContent data-testid="share-dialog">
        <DialogTitle>Share the review</DialogTitle>
        <DialogDescription>Everything here is built from the client-safe review. Nothing private is included.</DialogDescription>
        {error && (
          <p role="alert" className="text-sm text-destructive" data-testid="share-error">
            {error}
          </p>
        )}
        {!kit && !error && <p className="text-sm text-muted-foreground">Preparing…</p>}
        {kit && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="share-to" className="text-sm font-medium">
                Email to
              </label>
              <div className="flex gap-2">
                <Input id="share-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="client@example.com" />
                <Button asChild>
                  <a href={mailHref ?? undefined} data-testid="share-email" onClick={() => setMessage("Opened a draft in your email app. Attach the PDF yourself: a mail link cannot attach files.")}>
                    <Mail /> Open draft
                  </a>
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
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
            </div>
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
