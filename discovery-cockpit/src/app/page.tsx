import Link from "next/link";
import { AppShell, StatusBadge } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SESSION_TYPE_INFO } from "@/lib/session-types";
import { getConsultant } from "@/server/consultant";
import { listSessions } from "@/server/sessions";

export const dynamic = "force-dynamic";

export default async function Home() {
  const consultant = await getConsultant();
  const sessions = await listSessions(consultant?.id);
  return (
    <AppShell
      current="sessions"
      title="Sessions"
      intro="Private coaching for you during the call. A clean review for your client after it."
      actions={
        <Button asChild>
          <Link href="/sessions/new">New session</Link>
        </Button>
      }
    >
      {!consultant && (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          No consultant profile yet. Run <code>npm run setup</code> to create the demo profile and call.
        </p>
      )}
      <Card>
        <CardContent className="p-0">
          {sessions.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              No sessions yet. <Link href="/clients/new" className="underline">Add a client</Link>, then start a session for them.
            </p>
          ) : (
            <ul className="divide-y">
              {sessions.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3" data-testid="session-row">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{s.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.clientName} · {SESSION_TYPE_INFO[s.type].label} · {s.segmentCount} transcript turns
                    </p>
                  </div>
                  <StatusBadge status={s.status} />
                  <Button asChild size="sm">
                    <Link href={`/cockpit/${s.id}`}>Open cockpit</Link>
                  </Button>
                  {s.hasReport && (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/reveal/${s.id}`}>Client reveal</Link>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        <Link href="/health" className="underline">
          Health check
        </Link>
      </p>
    </AppShell>
  );
}
