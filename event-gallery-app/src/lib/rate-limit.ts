import { NextRequest } from "next/server";
import { db } from "./db";

/** Best-effort client IP for rate-limiting public endpoints behind a proxy/CDN. */
export function clientIpFrom(req: NextRequest) {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() ?? "unknown";
  return req.headers.get("x-real-ip") ?? "unknown";
}

/**
 * DB-backed sliding-window rate limit. Records a hit and returns whether the
 * caller is still within `limit` hits over the trailing `windowSeconds`.
 * Also opportunistically prunes old hits for this key so the table doesn't
 * grow unbounded.
 */
export async function checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const windowStart = new Date(Date.now() - windowSeconds * 1000);

  await db.rateLimitHit.deleteMany({ where: { key, createdAt: { lt: windowStart } } });

  const count = await db.rateLimitHit.count({ where: { key, createdAt: { gte: windowStart } } });
  if (count >= limit) return false;

  await db.rateLimitHit.create({ data: { key } });
  return true;
}
