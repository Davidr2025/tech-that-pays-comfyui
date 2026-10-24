import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { LeadFinderPanel } from "@/components/lead-finder-panel";
import { requireConsultant } from "@/server/auth";
import { getLeadSettings, listLeads } from "@/server/leads";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Lead Finder · Discovery Cockpit", robots: { index: false, follow: false } };

export default async function LeadsPage() {
  const consultant = await requireConsultant();
  return (
    <AppShell current="sessions" title="Lead Finder" intro="Coming soon. A preview of where this is going, which only stores a list you import yourself.">
      {consultant ? (
        <LeadFinderPanel settings={await getLeadSettings(consultant.id)} {...(await listLeads(consultant.id))} />
      ) : (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          No consultant profile yet. Run <code>npm run setup</code>.
        </p>
      )}
    </AppShell>
  );
}
