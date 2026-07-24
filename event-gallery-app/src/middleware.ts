import { NextRequest, NextResponse } from "next/server";

/**
 * White-label support: when a request's Host header isn't one of this app's
 * own domains, its root "/" is rewritten to a landing route that looks up
 * the matching SubAccount.customDomain and redirects to that business's
 * live event (or shows a branded "no live events" page). Everything else
 * (e.g. /e/[slug]) already works under any hostname pointed at this
 * deployment without rewriting, since routing here isn't host-scoped.
 *
 * Middleware runs on the Edge runtime, where Prisma can't run directly —
 * so the actual DB lookup happens in the Node.js route this rewrites to,
 * not here.
 */
export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname !== "/") {
    return NextResponse.next();
  }

  const host = req.headers.get("host") ?? "";
  const appHostnames = (process.env.APP_HOSTNAMES ?? "localhost:3000")
    .split(",")
    .map((h) => h.trim());

  if (appHostnames.includes(host)) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = "/custom-domain-landing";
  url.searchParams.set("host", host);
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: "/",
};
