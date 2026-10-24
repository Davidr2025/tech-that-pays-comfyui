import { AppShell } from "@/components/app-shell";
import { PasswordForm } from "@/components/password-form";
import { SettingsForm } from "@/components/settings-form";
import { authMode } from "@/lib/auth/mode";
import { claudeConfigured, claudeModel } from "@/server/ai/claude";
import { requireConsultant } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const c = await requireConsultant();
  return (
    <AppShell current="settings" title="Settings" intro="Your name, branding and booking link. They appear on every client review you build.">
      {c ? (
        <>
        <SettingsForm
          initial={{
            name: c.name,
            email: c.email,
            businessName: c.businessName,
            tagline: c.tagline ?? "",
            primaryColor: c.primaryColor,
            accentColor: c.accentColor,
            calendarLink: c.calendarLink ?? "",
            embedBooking: c.embedBooking,
            logoUrl: c.logoUrl,
            // A saved Claude choice means nothing without a key: show what is actually in use.
            aiProvider: c.aiProvider === "claude" && claudeConfigured() ? "claude" : "mock",
          }}
          claude={{ available: claudeConfigured(), model: claudeModel() }}
        />
        {authMode() === "accounts" && <PasswordForm />}
        </>
      ) : (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          No consultant profile yet. Run <code>npm run setup</code>.
        </p>
      )}
    </AppShell>
  );
}
