// GoHighLevel (GHL) Social Planner API client.
// https://marketplace.gohighlevel.com/docs/ghl/social-planner/
// GHL is itself multi-tenant: a "location" is the GHL equivalent of our
// sub-account, so each SocialConnection stores a locationId + access token.

const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";

export type GhlPlatform = "facebook" | "instagram" | "linkedin" | "pinterest" | "youtube" | "tiktok";

export interface GhlPublishParams {
  accessToken: string;
  locationId: string;
  accountIds: string[];
  platform: GhlPlatform;
  summary: string;
  mediaUrls?: string[];
  /** ISO 8601 timestamp. Omit to publish immediately. */
  scheduledAt?: string;
}

class GhlError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
  ) {
    super(message);
    this.name = "GhlError";
  }
}

async function ghlRequest<T>(
  accessToken: string,
  path: string,
  init: { method: string; body?: unknown },
): Promise<T> {
  const res = await fetch(`${GHL_BASE_URL}${path}`, {
    method: init.method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      Version: GHL_API_VERSION,
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new GhlError(`GHL API error (${res.status})`, res.status, json);
  }
  return json as T;
}

/** Creates (and immediately publishes, or schedules) a social post for a GHL location. */
export async function publishViaGhl(params: GhlPublishParams) {
  const body = {
    accountIds: params.accountIds,
    summary: params.summary,
    medias: (params.mediaUrls ?? []).map((url) => ({ url })),
    type: params.scheduledAt ? "scheduled" : "now",
    scheduleDate: params.scheduledAt,
    [params.platform]: {},
  };

  return ghlRequest<{ id: string; status: string }>(
    params.accessToken,
    `/social-media-posting/${params.locationId}/posts`,
    { method: "POST", body },
  );
}

export async function editGhlPost(params: {
  accessToken: string;
  locationId: string;
  postId: string;
  summary?: string;
  scheduledAt?: string;
}) {
  return ghlRequest(params.accessToken, `/social-media-posting/${params.locationId}/posts/${params.postId}`, {
    method: "PUT",
    body: { summary: params.summary, scheduleDate: params.scheduledAt },
  });
}
