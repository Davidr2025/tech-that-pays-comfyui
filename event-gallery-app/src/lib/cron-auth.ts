import { NextRequest } from "next/server";

/** Vercel Cron sends this header automatically; call manually with the same bearer token otherwise. */
export function isAuthorizedCronRequest(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}
