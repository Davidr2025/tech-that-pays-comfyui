import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deleteObject } from "@/lib/storage";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";

/**
 * Deletes media (and its storage objects) for events past their retention
 * window. Run on a daily schedule (e.g. Vercel Cron) with an Authorization:
 * Bearer <CRON_SECRET> header. GET, not POST — Vercel Cron always invokes
 * scheduled endpoints with GET.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const expiredEvents = await db.event.findMany({
    where: { expiresAt: { lt: new Date() }, permanentStorage: false },
    include: { media: true },
  });

  let deletedMedia = 0;
  for (const event of expiredEvents) {
    for (const media of event.media) {
      await deleteObject(media.storageKey).catch(() => {
        // Best-effort: keep going even if an individual object is already gone.
      });
      if (media.thumbnailKey) {
        await deleteObject(media.thumbnailKey).catch(() => {});
      }
    }
    await db.mediaAsset.deleteMany({ where: { eventId: event.id } });
    deletedMedia += event.media.length;
  }

  return NextResponse.json({ eventsProcessed: expiredEvents.length, mediaDeleted: deletedMedia });
}
