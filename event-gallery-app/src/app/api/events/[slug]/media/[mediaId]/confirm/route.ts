import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/** Called by the browser after the presigned PUT to object storage succeeds. */
export async function POST(_req: NextRequest, { params }: { params: { slug: string; mediaId: string } }) {
  const media = await db.mediaAsset.findUnique({
    where: { id: params.mediaId },
    include: { event: true },
  });

  if (!media || media.event.slug !== params.slug) {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }

  await db.mediaAsset.update({
    where: { id: media.id },
    data: { uploadConfirmed: true },
  });

  return NextResponse.json({ ok: true });
}
