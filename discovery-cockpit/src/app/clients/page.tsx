import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getConsultant } from "@/server/consultant";
import { listClients } from "@/server/clients";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const consultant = await getConsultant();
  const clients = consultant ? await listClients(consultant.id) : [];
  return (
    <AppShell
      current="clients"
      title="Clients"
      intro="Everyone you run discovery calls for. Add a website and brand colours to dress their review in their own look."
      actions={
        <Button asChild>
          <Link href="/clients/new">Add client</Link>
        </Button>
      }
    >
      <Card>
        <CardContent className="p-0">
          {clients.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No clients yet. Add one to start a session.</p>
          ) : (
            <ul className="divide-y">
              {clients.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3" data-testid="client-row">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{c.companyName}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.name}
                      {c.websiteUrl ? ` · ${c.websiteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}` : ""} · {c.sessionCount} {c.sessionCount === 1 ? "session" : "sessions"}
                    </p>
                  </div>
                  {c.brand && (
                    <span className="flex gap-1" aria-label="Brand colours">
                      <span className="size-5 rounded border" style={{ backgroundColor: c.brand.primary }} />
                      {c.brand.accent && <span className="size-5 rounded border" style={{ backgroundColor: c.brand.accent }} />}
                    </span>
                  )}
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/clients/${c.id}`}>Edit</Link>
                  </Button>
                  <Button asChild size="sm">
                    <Link href={`/sessions/new?client=${c.id}`}>New session</Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
