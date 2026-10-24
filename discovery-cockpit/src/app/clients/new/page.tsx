import { AppShell } from "@/components/app-shell";
import { ClientForm } from "@/components/client-form";

export default function NewClientPage() {
  return (
    <AppShell current="clients" title="Add a client">
      <ClientForm initial={{ name: "", companyName: "", industry: "", websiteUrl: "", calendarLink: "", brand: null }} />
    </AppShell>
  );
}
