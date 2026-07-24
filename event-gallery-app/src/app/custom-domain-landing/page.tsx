import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { THEME_STYLES } from "@/lib/themes";

/**
 * Rendered when a request's Host header doesn't match this app's own
 * domain(s) — see src/middleware.ts. Resolves the host to a white-labeled
 * SubAccount and either redirects to its current live event or shows a
 * branded holding page.
 */
export default async function CustomDomainLandingPage({
  searchParams,
}: {
  searchParams: { host?: string };
}) {
  const host = searchParams.host ?? "";
  const subAccount = await db.subAccount.findUnique({ where: { customDomain: host } });
  if (!subAccount) notFound();

  const liveEvent = await db.event.findFirst({
    where: {
      subAccountId: subAccount.id,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { eventDate: "desc" },
  });

  if (liveEvent) {
    redirect(`/e/${liveEvent.slug}`);
  }

  const theme = THEME_STYLES.CLASSIC;
  return (
    <main className={`flex min-h-screen items-center justify-center ${theme.bg}`}>
      <div className="text-center">
        <h1 className="text-3xl font-bold">{subAccount.name}</h1>
        <p className="mt-2 opacity-70">No live events right now — check back soon.</p>
      </div>
    </main>
  );
}
