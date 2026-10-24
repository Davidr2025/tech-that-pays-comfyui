import { AppShell } from "@/components/app-shell";
import { ClientForm } from "@/components/client-form";

export default function NewClientPage() {
  return (
    <AppShell current="clients" title="Add a client">
      <ClientForm initial={{ name: "", email: "", companyName: "", industry: "", websiteUrl: "", calendarLink: "", hourlyValue: "", brand: null }} />
    </AppShell>
  );
}
