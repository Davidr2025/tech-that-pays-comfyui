import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { authMode, signupOpen } from "@/lib/auth/mode";
import { hasOwner } from "@/server/accounts";
import { currentConsultant } from "@/server/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Create account · Discovery Cockpit", robots: { index: false, follow: false } };

export default async function SignupPage() {
  if (authMode() === "local" || (await currentConsultant())) redirect("/");
  if (!signupOpen(await hasOwner())) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 text-center">
        <h1 className="text-lg font-semibold">Sign-up is closed</h1>
        <p className="mt-2 text-sm text-muted-foreground">This server already has an owner. Ask them for an account.</p>
        <Link href="/login" className="mt-4 text-sm underline">
          Back to sign in
        </Link>
      </main>
    );
  }
  return <AuthForm mode="signup" canSignUp />;
}
