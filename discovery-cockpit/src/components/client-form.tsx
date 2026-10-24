"use client";

import { Globe } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ColorField } from "@/components/color-field";
import { Field } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { StoredBrandColors } from "@/lib/validation";

export interface ClientValues {
  name: string;
  email: string;
  companyName: string;
  industry: string;
  websiteUrl: string;
  calendarLink: string;
  hourlyValue: string;
  brand: StoredBrandColors | null;
}

interface Suggestion {
  primary: string;
  accent: string | null;
  detected: string[];
}

export function ClientForm({ clientId, initial }: { clientId?: string; initial: ClientValues }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [savedWebsite, setSavedWebsite] = useState(initial.websiteUrl);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [detectMsg, setDetectMsg] = useState<string | null>(null);
  const set = <K extends keyof ClientValues>(k: K, value: ClientValues[K]) => setV((s) => ({ ...s, [k]: value }));
  const brand = v.brand;
  const setBrand = (patch: Partial<StoredBrandColors>) =>
    set("brand", { primary: "#0f766e", accent: null, source: "manual", detected: [], ...brand, ...patch });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(clientId ? `/api/clients/${clientId}` : "/api/clients", {
        method: clientId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...v, brandColors: v.brand }),
      });
      const json = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) setMsg({ ok: false, text: json.error ?? "Could not save." });
      else if (!clientId && json.id) router.push(`/clients/${json.id}`);
      else {
        setSavedWebsite(v.websiteUrl);
        setMsg({ ok: true, text: "Saved." });
        router.refresh();
      }
    } catch {
      setMsg({ ok: false, text: "Could not reach the server." });
    }
    setBusy(false);
  }

  async function detect() {
    if (!clientId) return;
    setDetecting(true);
    setDetectMsg(null);
    setSuggestion(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/brand`, { method: "POST" });
      const json = (await res.json()) as { colors?: Suggestion | null; error?: string };
      if (!res.ok) setDetectMsg(json.error ?? "Could not check that website.");
      else if (!json.colors) setDetectMsg("No clear brand colour found on that site. Pick colours by hand below.");
      else setSuggestion(json.colors);
    } catch {
      setDetectMsg("Could not reach the server.");
    }
    setDetecting(false);
  }

  function applySuggestion(s: Suggestion) {
    set("brand", { primary: s.primary, accent: s.accent, source: "website", detected: s.detected });
    setSuggestion(null);
  }

  const websiteChanged = v.websiteUrl.trim() !== savedWebsite.trim();
  const canDetect = Boolean(clientId && savedWebsite.trim() && !websiteChanged);

  return (
    <form onSubmit={save} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Client</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Contact name">
            <Input id="name" value={v.name} onChange={(e) => set("name", e.target.value)} required />
          </Field>
          <Field label="Email" hint="Optional. Used only to address your follow-up email.">
            <Input id="email" type="email" value={v.email} onChange={(e) => set("email", e.target.value)} placeholder="priya@brightline.example" />
          </Field>
          <Field label="Company">
            <Input id="companyName" value={v.companyName} onChange={(e) => set("companyName", e.target.value)} required />
          </Field>
          <Field label="Industry" hint="Optional.">
            <Input id="industry" value={v.industry} onChange={(e) => set("industry", e.target.value)} />
          </Field>
          <Field label="Website">
            <Input id="websiteUrl" value={v.websiteUrl} onChange={(e) => set("websiteUrl", e.target.value)} placeholder="brightline.example" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Booking link" hint="Optional. Overrides your default link on this client's review.">
              <Input id="calendarLink" value={v.calendarLink} onChange={(e) => set("calendarLink", e.target.value)} placeholder="https://calendly.com/you/30min" />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field
              label="Value of an hour of their team's time ($)"
              hint="Optional. Your assumption, used only to put a dollar value on hours the client says they lose. The review labels it as an assumption."
            >
              <Input id="hourlyValue" inputMode="numeric" value={v.hourlyValue} onChange={(e) => set("hourlyValue", e.target.value)} placeholder="60" />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Client branding</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Optional. With these colours you can dress a client&apos;s review in their brand instead of yours, per session.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" onClick={detect} disabled={!canDetect || detecting} data-testid="detect-brand">
              <Globe /> {detecting ? "Checking the website…" : "Detect from website"}
            </Button>
            {!clientId && <span className="text-xs text-muted-foreground">Save the client first, then detect from their website.</span>}
            {clientId && !savedWebsite.trim() && <span className="text-xs text-muted-foreground">Add and save a website address to detect colours.</span>}
            {clientId && websiteChanged && savedWebsite.trim() !== "" && <span className="text-xs text-muted-foreground">Save the new address first.</span>}
          </div>
          {detectMsg && (
            <p role="alert" className="text-sm text-destructive" data-testid="detect-message">
              {detectMsg}
            </p>
          )}
          {suggestion && (
            <div className="rounded-md border p-3" data-testid="suggestion">
              <p className="mb-2 text-sm font-medium">Found on their website</p>
              <div className="flex flex-wrap items-center gap-2">
                {suggestion.detected.map((c) => (
                  <span key={c} className="inline-flex items-center gap-1.5 rounded border px-2 py-1 text-xs font-mono">
                    <span className="size-4 rounded-sm border" style={{ backgroundColor: c }} /> {c}
                  </span>
                ))}
              </div>
              <Button type="button" size="sm" className="mt-3" onClick={() => applySuggestion(suggestion)} data-testid="use-suggestion">
                Use {suggestion.primary}
                {suggestion.accent ? ` and ${suggestion.accent}` : ""}
              </Button>
            </div>
          )}

          {brand ? (
            <div className="space-y-3">
              <div className="grid gap-4 sm:grid-cols-2">
                <ColorField id="brand-primary" label="Client primary colour" value={brand.primary} onChange={(c) => setBrand({ primary: c, source: "manual" })} />
                <ColorField id="brand-accent" label="Client accent colour" value={brand.accent ?? ""} onChange={(c) => setBrand({ accent: c || null, source: "manual" })} />
              </div>
              {brand.detected.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Detected:</span>
                  {brand.detected.map((c) => (
                    <button key={c} type="button" title={`Use ${c} as primary`} aria-label={`Use ${c} as primary`} onClick={() => setBrand({ primary: c, source: "manual" })} className="size-6 rounded border" style={{ backgroundColor: c }} />
                  ))}
                </div>
              )}
              <Button type="button" variant="ghost" size="sm" onClick={() => set("brand", null)}>
                Remove client branding
              </Button>
            </div>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => setBrand({})} data-testid="set-colours">
              Pick colours by hand
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy} data-testid="save-client">
          {busy ? "Saving…" : clientId ? "Save client" : "Add client"}
        </Button>
        {msg && (
          <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-sm text-emerald-700" : "text-sm text-destructive"} data-testid="client-message">
            {msg.text}
          </p>
        )}
      </div>
    </form>
  );
}
