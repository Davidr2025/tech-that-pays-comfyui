/**
 * Consultant logos are stored as small data: URLs (no file storage needed, and it travels with
 * the reveal payload). Only raster images and SVG, size-capped, and only ever rendered inside
 * an <img> tag — where an SVG cannot run script.
 */
export const MAX_LOGO_CHARS = 200_000; // ~150 KB of image after base64

const LOGO_URL = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/;

export function isValidLogoUrl(value: string): boolean {
  return value.length <= MAX_LOGO_CHARS && LOGO_URL.test(value);
}

export function logoProblem(value: string): string | null {
  if (value.length > MAX_LOGO_CHARS) return "That logo is too large. Use an image under 150 KB.";
  if (!LOGO_URL.test(value)) return "Logos must be PNG, JPEG, WebP or SVG images.";
  return null;
}
