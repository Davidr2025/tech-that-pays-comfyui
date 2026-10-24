import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { authMode, signupOpen } from "@/lib/auth/mode";
import { hasOwner } from "@/server/accounts";
import { currentConsultant } from "@/server/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in · Discovery Cockpit", robots: { index: false, follow: false } };

export default async function LoginPage() {
  if (authMode() === "local" || (await currentConsultant())) redirect("/");
  return <AuthForm mode="login" canSignUp={signupOpen(await hasOwner())} />;
}
