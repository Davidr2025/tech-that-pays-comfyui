/**
 * Two ways to run:
 *  - "local": one person on their own machine. No login; "you" is the oldest consultant. This is the
 *    zero-config demo, and the default in development and tests.
 *  - "accounts": login required, every record belongs to one consultant, nothing is shared.
 *
 * A production build with AUTH_MODE unset runs as "accounts", so a deployment is safe by default.
 * Running open in production needs AUTH_MODE=local, spelled out.
 */
export type AuthMode = "local" | "accounts";

export function authMode(env: Record<string, string | undefined> = process.env): AuthMode {
  const v = env.AUTH_MODE?.trim().toLowerCase();
  if (v === "local" || v === "accounts") return v;
  return env.NODE_ENV === "production" ? "accounts" : "local";
}

/** After the first account exists, more can only join when the operator says so. */
export function signupOpen(hasOwner: boolean, env: Record<string, string | undefined> = process.env): boolean {
  return !hasOwner || env.ALLOW_SIGNUP?.trim().toLowerCase() === "true";
}
