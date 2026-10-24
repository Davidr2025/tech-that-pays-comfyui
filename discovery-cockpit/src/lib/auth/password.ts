import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number, opts: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;

// OWASP-recommended minimum for scrypt: N=2^17, r=8, p=1 (about 128 MB, so allow it explicitly).
// Tests use a cheap cost so a suite that signs in many times stays fast. The cost is stored inside every
// hash, so verification always uses the cost the hash was made with.
const STRONG_N = 2 ** 17;
const TEST_N = 2 ** 10;
export const scryptCost = () => (process.env.NODE_ENV === "test" ? TEST_N : STRONG_N);
const PARAMS = { r: 8, p: 1 } as const;
const MAXMEM = 256 * 1024 * 1024;
const KEYLEN = 32;

export const MIN_PASSWORD = 10;
export const MAX_PASSWORD = 200;

/** Returns a message when the password is not acceptable, else null. Length matters; character-class rules do not. */
export function passwordProblem(password: string, email: string): string | null {
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (password.length > MAX_PASSWORD) return `Keep it under ${MAX_PASSWORD} characters.`;
  if (password.toLowerCase() === email.trim().toLowerCase()) return "Your password cannot be your email address.";
  if (/^(.)\1+$/.test(password)) return "Choose something less repetitive.";
  return null;
}

/** `scrypt$N$r$p$salt$hash`: parameters travel with the hash so they can be raised later. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const N = scryptCost();
  const hash = await scrypt(password, salt, KEYLEN, { N, ...PARAMS, maxmem: MAXMEM });
  return ["scrypt", N, PARAMS.r, PARAMS.p, salt.toString("base64"), hash.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const parts = stored?.split("$");
  if (!parts || parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, salt, hash] = parts as [string, string, string, string, string, string];
  const expected = Buffer.from(hash, "base64");
  try {
    const actual = await scrypt(password, Buffer.from(salt, "base64"), expected.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: MAXMEM });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

let dummy: Promise<string> | null = null;
/** Verifies against a throwaway hash so an unknown email takes as long as a wrong password. */
export async function burnVerifyTime(password: string): Promise<void> {
  dummy ??= hashPassword("not-a-real-password");
  await verifyPassword(password, await dummy);
}
