import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { createPresignedUploadUrl, mediaStorageKey } from "@/lib/storage";
import { classifyContentType } from "@/lib/mime";

const bodySchema = z.object({
  contentType: z.string(),
  uploaderName: z.string().max(80).optional(),
});

// No auth required — this is the guest-facing "scan QR, upload" flow.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const classified = classifyContentType(parsed.data.contentType);
  if (!classified) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 415 });
  }

  const event = await db.event.findUnique({ where: { slug: params.slug } });
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  if (event.expiresAt && event.expiresAt < new Date()) {
    return NextResponse.json({ error: "This event gallery has expired" }, { status: 410 });
  }

  const media = await db.mediaAsset.create({
    data: {
      eventId: event.id,
      type: classified.type,
      storageKey: "", // filled in immediately below, before returning
      uploaderName: parsed.data.uploaderName,
    },
  });

  const storageKey = mediaStorageKey(event.id, media.id, classified.ext);
  await db.mediaAsset.update({ where: { id: media.id }, data: { storageKey } });

  const uploadUrl = await createPresignedUploadUrl({
    key: storageKey,
    contentType: parsed.data.contentType,
  });

  return NextResponse.json({ mediaId: media.id, uploadUrl, storageKey });
}
