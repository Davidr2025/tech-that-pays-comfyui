import { Readable } from "node:stream";
import { google } from "googleapis";
import { db } from "./db";
import { publicUrlFor } from "./storage";

const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.file", "openid", "email"];

function oauthClient() {
  const appBaseUrl = process.env.APP_BASE_URL?.replace(/\/$/, "");
  return new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    `${appBaseUrl}/api/integrations/google-drive/callback`,
  );
}

/** state carries the sub-account id through Google's redirect round-trip. */
export function buildGoogleDriveAuthUrl(subAccountId: string) {
  const client = oauthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // ensures a refresh_token is returned even on repeat connects
    scope: DRIVE_SCOPES,
    state: Buffer.from(JSON.stringify({ subAccountId })).toString("base64url"),
  });
}

export function decodeGoogleDriveState(state: string): { subAccountId: string } {
  return JSON.parse(Buffer.from(state, "base64url").toString("utf-8"));
}

export async function exchangeGoogleDriveCode(code: string) {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      "Google didn't return a refresh token — the account may already be connected; disconnect and reconnect to force a fresh consent.",
    );
  }

  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ auth: client, version: "v2" });
  const { data: profile } = await oauth2.userinfo.get();

  return { refreshToken: tokens.refresh_token, email: profile.email ?? undefined };
}

function driveClientForRefreshToken(refreshToken: string) {
  const client = oauthClient();
  client.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: "v3", auth: client });
}

async function findOrCreateFolder(
  drive: ReturnType<typeof driveClientForRefreshToken>,
  name: string,
  parentId?: string,
) {
  const parentClause = parentId ? ` and '${parentId}' in parents` : "";
  const escapedName = name.replace(/'/g, "\\'");
  const { data } = await drive.files.list({
    q: `name='${escapedName}' and mimeType='application/vnd.google-apps.folder' and trashed=false${parentClause}`,
    fields: "files(id, name)",
    spaces: "drive",
  });

  const existing = data.files?.[0];
  if (existing?.id) return existing.id;

  const { data: created } = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    },
    fields: "id",
  });
  if (!created.id) throw new Error("Google Drive did not return a folder id");
  return created.id;
}

/**
 * Exports every approved, not-yet-synced upload for an event into
 * "<sub-account root folder>/<event name>/" in the connected Drive, and
 * marks each exported MediaAsset so re-runs don't duplicate uploads.
 */
export async function syncEventMediaToGoogleDrive(eventId: string) {
  const event = await db.event.findUniqueOrThrow({
    where: { id: eventId },
    include: {
      subAccount: {
        include: { externalStorageConnections: { where: { provider: "GOOGLE_DRIVE" } } },
      },
      media: { where: { status: "APPROVED", uploadConfirmed: true, syncedExternally: false } },
    },
  });

  const connection = event.subAccount.externalStorageConnections[0];
  if (!connection || event.media.length === 0) {
    return { exported: 0 };
  }

  const drive = driveClientForRefreshToken(connection.refreshToken);

  let rootFolderId = connection.rootFolderId;
  if (!rootFolderId) {
    rootFolderId = await findOrCreateFolder(drive, "Event Gallery");
    await db.externalStorageConnection.update({
      where: { id: connection.id },
      data: { rootFolderId },
    });
  }

  const eventFolderId = await findOrCreateFolder(drive, event.name, rootFolderId);

  let exported = 0;
  for (const media of event.media) {
    const res = await fetch(publicUrlFor(media.storageKey));
    if (!res.ok || !res.body) continue;

    const contentType = res.headers.get("content-type") ?? "application/octet-stream";
    const ext = media.storageKey.split(".").pop() ?? "bin";

    await drive.files.create({
      requestBody: { name: `${media.id}.${ext}`, parents: [eventFolderId] },
      media: { mimeType: contentType, body: Readable.fromWeb(res.body as import("stream/web").ReadableStream) },
    });

    await db.mediaAsset.update({ where: { id: media.id }, data: { syncedExternally: true } });
    exported += 1;
  }

  return { exported };
}
