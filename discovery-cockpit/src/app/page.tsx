import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/form-bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SESSION_TYPE_INFO } from "@/lib/session-types";
import { requireConsultant } from "@/server/auth";
import { listSessions } from "@/server/sessions";

export const dynamic = "force-dynamic";

export default async function Home() {
  const consultant = await requireConsultant();
  const sessions = consultant ? await listSessions(consultant.id) : [];
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
      <Card data-testid="lead-finder-card">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium">
              Lead Finder <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">Coming soon</span>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">A preview, off by default. It only keeps a list you import yourself; nothing is searched or scraped.</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/leads" data-testid="lead-finder-link">
              Open the preview
            </Link>
          </Button>
        </CardContent>
      </Card>
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
