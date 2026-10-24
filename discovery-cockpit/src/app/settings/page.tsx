import { AppShell } from "@/components/app-shell";
import { SettingsForm } from "@/components/settings-form";
import { getConsultant } from "@/server/consultant";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const c = await getConsultant();
  return (
    <AppShell current="settings" title="Settings" intro="Your name, branding and booking link. They appear on every client review you build.">
      {c ? (
        <SettingsForm
          initial={{
            name: c.name,
            email: c.email,
            businessName: c.businessName,
            tagline: c.tagline ?? "",
            primaryColor: c.primaryColor,
            accentColor: c.accentColor,
            calendarLink: c.calendarLink ?? "",
            logoUrl: c.logoUrl,
          }}
        />
      ) : (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          No consultant profile yet. Run <code>npm run setup</code>.
        </p>
      )}
    </AppShell>
  );
}
