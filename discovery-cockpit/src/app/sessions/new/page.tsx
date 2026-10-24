import { AppShell } from "@/components/app-shell";
import { NewSessionForm } from "@/components/new-session-form";
import { getConsultant } from "@/server/consultant";
import { listClients } from "@/server/clients";

export const dynamic = "force-dynamic";

export default async function NewSessionPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const { client } = await searchParams;
  const consultant = await getConsultant();
  const clients = consultant ? await listClients(consultant.id) : [];
  return (
    <AppShell current="sessions" title="New session" intro="Pick who the call is with and what kind of session it is. You can load or type the transcript in the cockpit.">
      <NewSessionForm
        clients={clients.map((c) => ({ id: c.id, label: `${c.companyName} (${c.name})`, hasBrand: c.brand !== null }))}
        initialClientId={client ?? null}
      />
    </AppShell>
  );
}
