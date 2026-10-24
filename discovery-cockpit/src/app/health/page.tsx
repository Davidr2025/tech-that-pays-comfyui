import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

async function check() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const [consultants, clients, sessions, segments] = await Promise.all([
      prisma.consultant.count(),
      prisma.client.count(),
      prisma.session.count(),
      prisma.transcriptSegment.count(),
    ]);
    return { ok: true as const, counts: { consultants, clients, sessions, segments } };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : "unknown error" };
  }
}

export default async function HealthPage() {
  const result = await check();
  return (
    <main className="mx-auto max-w-md space-y-4 px-4 py-10">
      <h1 className="text-xl font-semibold">Health check</h1>
      <p data-testid="health-status" className={result.ok ? "font-medium text-emerald-700" : "font-medium text-red-700"}>
        {result.ok ? "OK — app and database are up" : "Database is not reachable"}
      </p>
      {result.ok ? (
        <dl className="grid grid-cols-2 gap-1 text-sm">
          {Object.entries(result.counts).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="font-mono">{v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">
          {result.error}. Run <code>npm run setup</code>.
        </p>
      )}
    </main>
  );
}
