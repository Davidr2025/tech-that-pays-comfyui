/**
 * Which booking pages may be shown inside the client's review. An embedded page runs the provider's own
 * scripts in the client's browser, so this is an explicit allowlist of well-known scheduling providers,
 * https only, and the consultant has to opt in (Settings). Everything else stays a plain link.
 */
export const EMBED_HOSTS = ["calendly.com", "cal.com", "savvycal.com", "tidycal.com", "youcanbook.me"] as const;

export function embeddableBooking(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return false;
  // The parsed hostname, never the raw string: "calendly.com@evil.test" and "calendly.com.evil.test" are not Calendly.
  const host = u.hostname.toLowerCase();
  return EMBED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

export const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
};
