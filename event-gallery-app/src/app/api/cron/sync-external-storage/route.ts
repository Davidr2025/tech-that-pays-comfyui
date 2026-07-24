import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { syncEventMediaToGoogleDrive } from "@/lib/google-drive";

/**
 * Exports newly-approved media to each sub-account's connected external
 * storage (currently Google Drive). Run every 30 min or so via Vercel Cron.
 * GET, not POST — Vercel Cron always invokes scheduled endpoints with GET.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const events = await db.event.findMany({
    where: {
      subAccount: { externalStorageConnections: { some: { provider: "GOOGLE_DRIVE" } } },
      media: { some: { status: "APPROVED", uploadConfirmed: true, syncedExternally: false } },
    },
    select: { id: true },
  });

  let totalExported = 0;
  const failures: string[] = [];
  for (const event of events) {
    try {
      const result = await syncEventMediaToGoogleDrive(event.id);
      totalExported += result.exported;
    } catch (err) {
      failures.push(`${event.id}: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  return NextResponse.json({ eventsProcessed: events.length, totalExported, failures });
}
