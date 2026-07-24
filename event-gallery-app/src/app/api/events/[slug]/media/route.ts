import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { publicUrlFor } from "@/lib/storage";

/** Polled by the guest gallery and the slideshow to pick up new uploads live. */
export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const event = await db.event.findUnique({ where: { slug: params.slug } });
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const media = await db.mediaAsset.findMany({
    where: { eventId: event.id, status: "APPROVED", uploadConfirmed: true },
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  return NextResponse.json({
    media: media.map((m) => ({
      id: m.id,
      type: m.type,
      url: publicUrlFor(m.storageKey),
      uploaderName: m.uploaderName,
      createdAt: m.createdAt,
    })),
  });
}
