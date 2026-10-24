"use client";

import { Upload, X } from "lucide-react";
import { useState } from "react";
import { ColorField } from "@/components/color-field";
import { Field } from "@/components/form-bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { readableTextColor } from "@/lib/color";
import { logoProblem } from "@/lib/logo";

export interface ConsultantValues {
  name: string;
  email: string;
  businessName: string;
  tagline: string;
  primaryColor: string;
  accentColor: string;
  calendarLink: string;
  logoUrl: string | null;
}

export function SettingsForm({ initial }: { initial: ConsultantValues }) {
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof ConsultantValues>(k: K, value: ConsultantValues[K]) => setV((s) => ({ ...s, [k]: value }));

  async function chooseLogo(file: File | undefined) {
    if (!file) return;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
    const problem = logoProblem(dataUrl);
    if (problem) setMsg({ ok: false, text: problem });
    else {
      setMsg(null);
      set("logoUrl", dataUrl);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/consultant", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) });
      const json = (await res.json()) as { error?: string };
      setMsg(res.ok ? { ok: true, text: "Saved. New client reviews will use these settings." } : { ok: false, text: json.error ?? "Could not save." });
    } catch {
      setMsg({ ok: false, text: "Could not reach the server." });
    }
    setBusy(false);
  }

  const onPrimary = readableTextColor(/^#[0-9a-fA-F]{6}$/.test(v.primaryColor) ? v.primaryColor : "#0f766e");
  return (
    <form onSubmit={save} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>You and your business</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Your name">
            <Input id="name" value={v.name} onChange={(e) => set("name", e.target.value)} required />
          </Field>
          <Field label="Email">
            <Input id="email" type="email" value={v.email} onChange={(e) => set("email", e.target.value)} required />
          </Field>
          <Field label="Business name">
            <Input id="businessName" value={v.businessName} onChange={(e) => set("businessName", e.target.value)} required />
          </Field>
          <Field label="Tagline" hint="Optional. Shown under your name on client reviews.">
            <Input id="tagline" value={v.tagline} onChange={(e) => set("tagline", e.target.value)} maxLength={160} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Booking link" hint="Your calendar link. Clients can have their own; this is the default.">
              <Input id="calendarLink" value={v.calendarLink} onChange={(e) => set("calendarLink", e.target.value)} placeholder="https://calendly.com/you/30min" />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Branding</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <ColorField id="primary" label="Primary colour" value={v.primaryColor} onChange={(c) => set("primaryColor", c)} />
            <ColorField id="accent" label="Accent colour" value={v.accentColor} onChange={(c) => set("accentColor", c)} />
          </div>
          <div>
            <p className="mb-1 text-sm font-medium">Logo</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" asChild>
                <label className="cursor-pointer">
                  <Upload /> Choose image
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" aria-label="Logo file" data-testid="logo-input" onChange={(e) => void chooseLogo(e.target.files?.[0])} />
                </label>
              </Button>
              {v.logoUrl && (
                <Button type="button" variant="ghost" onClick={() => set("logoUrl", null)}>
                  <X /> Remove logo
                </Button>
              )}
              <span className="text-xs text-muted-foreground">PNG, JPEG, WebP or SVG, under 150 KB.</span>
            </div>
          </div>
          <div aria-label="Preview of the client review header" className="overflow-hidden rounded-lg border">
            <div className="flex items-start justify-between gap-4 px-6 py-5" style={{ backgroundColor: /^#[0-9a-fA-F]{6}$/.test(v.primaryColor) ? v.primaryColor : "#0f766e", color: onPrimary }}>
              <div>
                <p className="text-xs uppercase tracking-widest opacity-80">Discovery Review</p>
                <p className="mt-1 text-xl font-bold">{v.businessName || "Your business"}</p>
                {v.tagline && <p className="text-sm opacity-90">{v.tagline}</p>}
              </div>
              {v.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- a validated data: URL
                <img src={v.logoUrl} alt="Your logo" className="h-12 max-w-[8rem] rounded bg-white object-contain p-1.5" data-testid="logo-preview" />
              )}
            </div>
            <div className="px-6 py-3 text-sm" style={{ borderTop: `3px solid ${/^#[0-9a-fA-F]{6}$/.test(v.accentColor) ? v.accentColor : "#d97706"}` }}>
              <span className="text-muted-foreground">Accent colour appears on highlights such as the timeline and the future-state panel.</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy} data-testid="save-settings">
          {busy ? "Saving…" : "Save settings"}
        </Button>
        {msg && (
          <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-sm text-emerald-700" : "text-sm text-destructive"} data-testid="settings-message">
            {msg.text}
          </p>
        )}
      </div>
    </form>
  );
}
