const DEFAULT_RETENTION_DAYS = 14;

/** Tier-1 behavior: events expire N days after the event date unless permanentStorage is set. */
export function computeExpiresAt(eventDate: Date, permanentStorage: boolean): Date | null {
  if (permanentStorage) return null;
  const expires = new Date(eventDate);
  expires.setDate(expires.getDate() + DEFAULT_RETENTION_DAYS);
  return expires;
}

export function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}
