import { AppShell } from "@/components/app-shell";
import { ClientForm } from "@/components/client-form";
import { requireConsultant } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function NewClientPage() {
  await requireConsultant();
  return (
    <AppShell current="clients" title="Add a client">
      <ClientForm initial={{ name: "", email: "", companyName: "", industry: "", websiteUrl: "", calendarLink: "", hourlyValue: "", brand: null }} />
    </AppShell>
  );
}
