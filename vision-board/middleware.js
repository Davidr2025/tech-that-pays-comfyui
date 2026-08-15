// Runs on every request before anything else — static pages included.
// This is what actually makes the board private: without it, board.html
// and the CEO view pages would just be plain files anyone with the URL
// could open, cookie or not.
import { next } from "@vercel/edge";
import { requestIsAuthed } from "./lib/auth.js";

const PUBLIC_PATHS = new Set(["/login.html", "/api/login"]);

export default async function middleware(request) {
  const { pathname } = new URL(request.url);

  if (PUBLIC_PATHS.has(pathname)) return next();

  const authed = await requestIsAuthed(request, process.env.SESSION_SECRET);

  if (!authed) {
    if (pathname.startsWith("/api/")) {
      return new Response(JSON.stringify({ error: "Not signed in" }), {
        status: 401,
        headers: { "content-type": "application/json" }
      });
    }
    return Response.redirect(new URL("/login.html", request.url), 302);
  }

  if (pathname === "/") {
    return Response.redirect(new URL("/board.html", request.url), 302);
  }

  return next();
}

export const config = {
  matcher: "/:path*"
};
