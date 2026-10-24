"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isAssessment, SESSION_TYPES, SESSION_TYPE_INFO, type SessionType } from "@/lib/session-types";

export interface ClientOption {
  id: string;
  label: string;
  hasBrand: boolean;
}

export function NewSessionForm({ clients, initialClientId }: { clients: ClientOption[]; initialClientId: string | null }) {
  const router = useRouter();
  const [clientId, setClientId] = useState(initialClientId ?? clients[0]?.id ?? "");
  const [type, setType] = useState<SessionType>("DISCOVERY");
  const [brandingMode, setBrandingMode] = useState<"CONSULTANT" | "CLIENT">("CONSULTANT");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const client = clients.find((c) => c.id === clientId);
  const effectiveBranding = brandingMode === "CLIENT" && client?.hasBrand ? "CLIENT" : "CONSULTANT";

  if (clients.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
        You need a client first. <Link href="/clients/new" className="underline">Add one</Link>.
      </p>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, type, brandingMode: effectiveBranding }),
      });
      const json = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !json.id) setError(json.error ?? "Could not create the session.");
      else router.push(`/cockpit/${json.id}`);
    } catch {
      setError("Could not reach the server.");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Client</CardTitle>
        </CardHeader>
        <CardContent>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Who is the call with?</span>
            <select
              id="clientId"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-2 text-xs text-muted-foreground">
            <Link href="/clients/new" className="underline">
              Add a new client
            </Link>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Session type</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {SESSION_TYPES.map((t) => {
            const info = SESSION_TYPE_INFO[t];
            return (
              <label key={t} className={`flex items-start gap-3 rounded-md border p-3 text-sm ${info.available ? "cursor-pointer" : "opacity-55"}`}>
                <input type="radio" name="type" value={t} checked={type === t} disabled={!info.available} onChange={() => setType(t)} className="mt-1" data-testid={`type-${t}`} />
                <span>
                  <span className="block font-medium">
                    {info.label}
                    {!info.available && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">Coming with assessment mode</span>}
                  </span>
                  <span className="text-muted-foreground">{info.description}</span>
                </span>
              </label>
            );
          })}
          <p className="text-xs text-muted-foreground" data-testid="type-hint">
            {isAssessment(type)
              ? "Assessment sessions use a longer question bank, and building the client review also generates a prototype dashboard from what the client tells you."
              : "A first conversation. The cockpit coaches you through it and builds a client-safe review afterwards."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Whose branding on the client review?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <label className="flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm">
            <input type="radio" name="branding" checked={brandingMode === "CONSULTANT"} onChange={() => setBrandingMode("CONSULTANT")} data-testid="brand-consultant" />
            <span className="font-medium">Mine</span> <span className="text-muted-foreground">your logo and colours from Settings</span>
          </label>
          <label className={`flex items-center gap-3 rounded-md border p-3 text-sm ${client?.hasBrand ? "cursor-pointer" : "opacity-55"}`}>
            <input type="radio" name="branding" checked={brandingMode === "CLIENT"} disabled={!client?.hasBrand} onChange={() => setBrandingMode("CLIENT")} data-testid="brand-client" />
            <span className="font-medium">The client&apos;s</span> <span className="text-muted-foreground">their colours</span>
          </label>
          {!client?.hasBrand && (
            <p className="text-xs text-muted-foreground">
              This client has no brand colours yet.{" "}
              <Link href={`/clients/${clientId}`} className="underline">
                Add them
              </Link>{" "}
              to use their branding. You can switch any time from the cockpit.
            </p>
          )}
        </CardContent>
      </Card>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy} data-testid="start-session">
        {busy ? "Starting…" : "Start session"}
      </Button>
    </form>
  );
}
