"use client";

import { useState } from "react";
import { Field } from "@/components/form-bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function PasswordForm() {
  const [v, setV] = useState({ current: "", next: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/auth/password", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        setV({ current: "", next: "" });
        setMsg({ ok: true, text: "Password changed. Your other devices were signed out." });
      } else setMsg({ ok: false, text: json.error ?? "Could not change the password." });
    } catch {
      setMsg({ ok: false, text: "Could not reach the server." });
    }
    setBusy(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Current password">
            <Input id="current-password" type="password" value={v.current} onChange={(e) => setV({ ...v, current: e.target.value })} autoComplete="current-password" required />
          </Field>
          <Field label="New password" hint="At least 10 characters.">
            <Input id="new-password" type="password" value={v.next} onChange={(e) => setV({ ...v, next: e.target.value })} autoComplete="new-password" required />
          </Field>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" disabled={busy} data-testid="change-password">
              {busy ? "Saving…" : "Change password"}
            </Button>
            {msg && (
              <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-sm text-emerald-700" : "text-sm text-destructive"} data-testid="password-message">
                {msg.text}
              </p>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
