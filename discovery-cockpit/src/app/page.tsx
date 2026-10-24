import Link from "next/link";
import { NewSessionForm } from "@/components/new-session-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listSessions } from "@/server/sessions";

export const dynamic = "force-dynamic";

export default async function Home() {
  const sessions = await listSessions();
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <header>
        <h1 className="text-2xl font-bold">Discovery Cockpit</h1>
        <p className="mt-1 text-muted-foreground">Private coaching for you during the call. A clean review for your client after it.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No sessions yet. Run <code>npm run db:seed</code> for the demo call, or start a blank one below.
            </p>
          ) : (
            <ul className="divide-y">
              {sessions.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-3 py-3" data-testid="session-row">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{s.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.clientName} · {s.segmentCount} transcript lines
                    </p>
                  </div>
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

      <Card>
        <CardHeader>
          <CardTitle>New session</CardTitle>
        </CardHeader>
        <CardContent>
          <NewSessionForm />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        <Link href="/health" className="underline">
          Health check
        </Link>
      </p>
    </main>
  );
}
