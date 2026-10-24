import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/form-bits";
import { ClientForm } from "@/components/client-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getClient } from "@/server/clients";
import { requireConsultant } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const consultant = await requireConsultant();
  const client = consultant ? await getClient(consultant.id, id) : null;
  if (!client) notFound();
  return (
    <AppShell
      current="clients"
      title={client.companyName}
      actions={
        <Button asChild>
          <Link href={`/sessions/new?client=${client.id}`}>New session</Link>
        </Button>
      }
    >
      <ClientForm
        clientId={client.id}
        initial={{
          name: client.name,
          companyName: client.companyName,
          industry: client.industry ?? "",
          websiteUrl: client.websiteUrl ?? "",
          email: client.email ?? "",
          calendarLink: client.calendarLink ?? "",
          hourlyValue: client.hourlyValue === null ? "" : String(client.hourlyValue),
          brand: client.brand,
        }}
      />
      {client.sessions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Sessions with {client.companyName}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {client.sessions.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                  <Link href={`/cockpit/${s.id}`} className="min-w-0 flex-1 truncate underline-offset-2 hover:underline">
                    {s.title}
                  </Link>
                  <StatusBadge status={s.status} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
