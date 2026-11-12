"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field } from "@/components/form-bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function AuthForm({ mode, canSignUp, needsCode = false }: { mode: "login" | "signup"; canSignUp: boolean; needsCode?: boolean }) {
  const router = useRouter();
  const [v, setV] = useState({ name: "", businessName: "", email: "", password: "", code: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof v, value: string) => setV((s) => ({ ...s, [k]: value }));
  const signup = mode === "signup";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = signup ? { name: v.name, businessName: v.businessName, email: v.email, password: v.password, ...(needsCode ? { code: v.code } : {}) } : { email: v.email, password: v.password };
      const res = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setError(json.error ?? "Something went wrong.");
      else {
        router.push("/");
        router.refresh();
        return;
      }
    } catch {
      setError("Could not reach the server.");
    }
    setBusy(false);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-10">
      <p className="mb-4 text-center font-semibold">Discovery Cockpit</p>
      <Card>
        <CardHeader>
          <CardTitle>{signup ? "Create your account" : "Sign in"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            {signup && (
              <>
                <Field label="Your name">
                  <Input id="name" value={v.name} onChange={(e) => set("name", e.target.value)} autoComplete="name" required />
                </Field>
                <Field label="Business name">
                  <Input id="businessName" value={v.businessName} onChange={(e) => set("businessName", e.target.value)} autoComplete="organization" required />
                </Field>
              </>
            )}
            <Field label="Email">
              <Input id="email" type="email" value={v.email} onChange={(e) => set("email", e.target.value)} autoComplete="email" required />
            </Field>
            <Field label="Password" hint={signup ? "At least 10 characters. A few random words is plenty." : undefined}>
              <Input id="password" type="password" value={v.password} onChange={(e) => set("password", e.target.value)} autoComplete={signup ? "new-password" : "current-password"} required />
            </Field>
            {signup && needsCode && (
              <Field label="Sign-up code" hint="The person who set up this server has it.">
                <Input id="code" value={v.code} onChange={(e) => set("code", e.target.value)} autoComplete="off" required data-testid="signup-code" />
              </Field>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive" data-testid="auth-error">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={busy} data-testid="auth-submit">
              {busy ? "One moment…" : signup ? "Create account" : "Sign in"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {signup ? (
              <>
                Already have an account?{" "}
                <Link href="/login" className="underline">
                  Sign in
                </Link>
              </>
            ) : canSignUp ? (
              <>
                New here?{" "}
                <Link href="/signup" className="underline" data-testid="to-signup">
                  Create an account
                </Link>
              </>
            ) : (
              "Sign-up is closed on this server."
            )}
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
