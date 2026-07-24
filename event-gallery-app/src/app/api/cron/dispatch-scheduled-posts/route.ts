import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { executeScheduledPost } from "@/lib/social-publish";

/**
 * Fires any ScheduledPost whose scheduledFor time has passed. Run on a
 * frequent schedule (e.g. every 5-15 minutes via Vercel Cron).
 */
export async function POST(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const due = await db.scheduledPost.findMany({
    where: { status: "SCHEDULED", scheduledFor: { lte: new Date() } },
    select: { id: true },
  });

  const results = await Promise.all(due.map((p) => executeScheduledPost(p.id)));

  return NextResponse.json({
    processed: results.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
  });
}
