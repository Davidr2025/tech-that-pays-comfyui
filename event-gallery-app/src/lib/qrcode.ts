import QRCode from "qrcode";
import { putObject, qrCodeStorageKey } from "./storage";

export function eventPublicUrl(slug: string) {
  const base = process.env.APP_BASE_URL?.replace(/\/$/, "") ?? "";
  return `${base}/e/${slug}`;
}

/**
 * Generates a QR code PNG for an event's guest-upload URL and stores it,
 * returning the storage key to save on the Event record.
 */
export async function generateAndStoreEventQrCode(eventId: string, slug: string) {
  const url = eventPublicUrl(slug);
  const pngBuffer = await QRCode.toBuffer(url, {
    type: "png",
    width: 1024,
    margin: 2,
    color: { dark: "#111111", light: "#ffffffff" },
  });
  const key = qrCodeStorageKey(eventId);
  await putObject(key, pngBuffer, "image/png");
  return key;
}
