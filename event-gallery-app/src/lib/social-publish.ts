import { db } from "./db";
import { publicUrlFor } from "./storage";
import { publishViaBlotato, type BlotatoPlatform } from "./blotato";
import { publishViaGhl, type GhlPlatform } from "./ghl";

interface StoredCredentials {
  apiKey?: string; // Blotato
  accessToken?: string; // GHL
  locationId?: string; // GHL
  accountId?: string; // Blotato target account
  accountIds?: string[]; // GHL target accounts
}

/**
 * Executes a ScheduledPost: loads its connection + media, calls the right
 * provider, and records the outcome. Used both for immediate "publish now"
 * and for the cron worker firing due scheduled posts.
 */
export async function executeScheduledPost(postId: string) {
  const post = await db.scheduledPost.findUniqueOrThrow({
    where: { id: postId },
    include: { socialConnection: true, media: true },
  });

  const credentials: StoredCredentials = JSON.parse(post.socialConnection.credentialsJson);
  const mediaUrls = post.media.map((m) => publicUrlFor(m.storageKey));
  const platform = post.targetPlatforms[0];

  await db.scheduledPost.update({ where: { id: post.id }, data: { status: "PUBLISHING" } });

  try {
    let providerPostId: string;

    if (post.provider === "BLOTATO") {
      if (!credentials.apiKey || !credentials.accountId) {
        throw new Error("Blotato connection is missing apiKey/accountId");
      }
      const result = await publishViaBlotato({
        apiKey: credentials.apiKey,
        accountId: credentials.accountId,
        platform: platform as BlotatoPlatform,
        text: post.caption ?? "",
        mediaUrls,
        scheduledTime: post.scheduledFor?.toISOString(),
      });
      providerPostId = result.id;
    } else {
      if (!credentials.accessToken || !credentials.locationId || !credentials.accountIds?.length) {
        throw new Error("GHL connection is missing accessToken/locationId/accountIds");
      }
      const result = await publishViaGhl({
        accessToken: credentials.accessToken,
        locationId: credentials.locationId,
        accountIds: credentials.accountIds,
        platform: platform as GhlPlatform,
        summary: post.caption ?? "",
        mediaUrls,
        scheduledAt: post.scheduledFor?.toISOString(),
      });
      providerPostId = result.id;
    }

    await db.scheduledPost.update({
      where: { id: post.id },
      data: {
        status: post.scheduledFor ? "SCHEDULED" : "PUBLISHED",
        providerPostId,
        error: null,
      },
    });
    return { ok: true as const, providerPostId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown publishing error";
    await db.scheduledPost.update({
      where: { id: post.id },
      data: { status: "FAILED", error: message },
    });
    return { ok: false as const, error: message };
  }
}
