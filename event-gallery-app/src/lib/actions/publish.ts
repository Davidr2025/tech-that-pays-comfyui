"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requireSubAccountRole } from "@/lib/authz";
import { executeScheduledPost } from "@/lib/social-publish";

/**
 * Creates a ScheduledPost from host-selected media and either fires it
 * immediately (no scheduledFor) or leaves it for the expiration/publish
 * cron to pick up at the requested time.
 */
export async function publishToSocialAction(formData: FormData) {
  const user = await requireUser();
  const eventSlug = String(formData.get("eventSlug") ?? "");
  const connectionId = String(formData.get("connectionId") ?? "");
  const platform = String(formData.get("platform") ?? "");
  const caption = String(formData.get("caption") ?? "").trim();
  const scheduledForRaw = String(formData.get("scheduledFor") ?? "").trim();
  const mediaIds = formData.getAll("mediaIds").map(String);
  const redirectTo = String(formData.get("redirectTo") ?? "/dashboard");

  const event = await db.event.findUnique({ where: { slug: eventSlug } });
  const connection = await db.socialConnection.findUnique({ where: { id: connectionId } });
  if (!event || !connection || mediaIds.length === 0) redirect(redirectTo);

  await requireSubAccountRole(user.id, event.subAccountId, "STAFF");

  const post = await db.scheduledPost.create({
    data: {
      eventId: event.id,
      socialConnectionId: connection.id,
      provider: connection.provider,
      caption,
      targetPlatforms: [platform],
      scheduledFor: scheduledForRaw ? new Date(scheduledForRaw) : null,
      status: scheduledForRaw ? "SCHEDULED" : "DRAFT",
      media: { connect: mediaIds.map((id) => ({ id })) },
    },
  });

  if (!scheduledForRaw) {
    await executeScheduledPost(post.id);
  }

  redirect(redirectTo);
}
