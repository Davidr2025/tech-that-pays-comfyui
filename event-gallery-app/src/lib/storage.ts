import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// S3-compatible client — works with Cloudflare R2, AWS S3, MinIO (local dev), or any compatible provider.
export const s3 = new S3Client({
  region: process.env.STORAGE_REGION ?? "auto",
  endpoint: process.env.STORAGE_ENDPOINT,
  // Required for MinIO/local dev; R2 and AWS ignore this or don't need it.
  forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE === "true",
  credentials: {
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY ?? "",
  },
});

const BUCKET = process.env.STORAGE_BUCKET ?? "";

/**
 * Returns a presigned PUT URL so the browser can upload a file directly to
 * object storage without the app server proxying the bytes.
 */
export async function createPresignedUploadUrl(params: {
  key: string;
  contentType: string;
  expiresInSeconds?: number;
}) {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: params.key,
    ContentType: params.contentType,
  });
  const url = await getSignedUrl(s3, command, {
    expiresIn: params.expiresInSeconds ?? 300,
  });
  return url;
}

export async function createPresignedGetUrl(key: string, expiresInSeconds = 3600) {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
}

export async function deleteObject(key: string) {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

export async function putObject(key: string, body: Buffer, contentType: string) {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

/** Public CDN/base URL for a storage key, when the bucket is served publicly. */
export function publicUrlFor(key: string) {
  const base = process.env.STORAGE_PUBLIC_BASE_URL?.replace(/\/$/, "");
  return `${base}/${key}`;
}

export function mediaStorageKey(eventId: string, mediaId: string, ext: string) {
  return `events/${eventId}/media/${mediaId}.${ext}`;
}

export function thumbnailStorageKey(eventId: string, mediaId: string) {
  return `events/${eventId}/thumbnails/${mediaId}.webp`;
}

export function qrCodeStorageKey(eventId: string) {
  return `events/${eventId}/qr-code.png`;
}
