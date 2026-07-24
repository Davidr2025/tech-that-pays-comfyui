// Blotato REST API client — https://help.blotato.com/api/start
// Publishes/schedules a post to a connected social account on behalf of a
// sub-account. One SocialConnection row stores the API key.

const BLOTATO_BASE_URL = "https://backend.blotato.com/v2";

export type BlotatoPlatform =
  | "twitter"
  | "instagram"
  | "tiktok"
  | "youtube"
  | "linkedin"
  | "facebook"
  | "threads"
  | "bluesky"
  | "pinterest";

export interface BlotatoAccount {
  id: string;
  platform: BlotatoPlatform;
  name?: string;
}

export interface BlotatoPublishParams {
  apiKey: string;
  accountId: string;
  platform: BlotatoPlatform;
  text: string;
  mediaUrls: string[];
  /** ISO 8601 timestamp with offset. Omit to publish immediately. */
  scheduledTime?: string;
}

class BlotatoError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
  ) {
    super(message);
    this.name = "BlotatoError";
  }
}

async function blotatoRequest<T>(
  apiKey: string,
  path: string,
  init: { method: string; body?: unknown },
): Promise<T> {
  const res = await fetch(`${BLOTATO_BASE_URL}${path}`, {
    method: init.method,
    headers: {
      "Content-Type": "application/json",
      "blotato-api-key": apiKey,
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new BlotatoError(`Blotato API error (${res.status})`, res.status, json);
  }
  return json as T;
}

/** Lists the social accounts connected to this Blotato workspace. */
export async function listBlotatoAccounts(apiKey: string): Promise<BlotatoAccount[]> {
  const data = await blotatoRequest<{ accounts: BlotatoAccount[] }>(apiKey, "/users/me/accounts", {
    method: "GET",
  });
  return data.accounts ?? [];
}

/**
 * Publishes (or schedules) a post via Blotato. content.platform and
 * target.targetType must match — Blotato uses both to route the post.
 */
export async function publishViaBlotato(params: BlotatoPublishParams) {
  const body: Record<string, unknown> = {
    post: {
      accountId: params.accountId,
      content: {
        text: params.text,
        mediaUrls: params.mediaUrls,
        platform: params.platform,
      },
      target: {
        targetType: params.platform,
      },
    },
  };

  // Scheduling fields live at the top level, not nested inside `post`.
  if (params.scheduledTime) {
    body.scheduledTime = params.scheduledTime;
  }

  return blotatoRequest<{ id: string; status: string }>(params.apiKey, "/posts", {
    method: "POST",
    body,
  });
}
