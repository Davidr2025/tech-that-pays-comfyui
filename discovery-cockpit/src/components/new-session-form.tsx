"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function NewSessionForm() {
  const router = useRouter();
  const [clientName, setClientName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName, companyName }),
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
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <label className="text-sm">
        <span className="mb-1 block text-muted-foreground">Client name</span>
        <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Jamie Rivera" required />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-muted-foreground">Company</span>
        <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Rivera Bakery" required />
      </label>
      <Button type="submit" disabled={busy}>
        Start blank session
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive sm:col-span-3">
          {error}
        </p>
      )}
    </form>
  );
}
