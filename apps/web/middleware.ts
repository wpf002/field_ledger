import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Fast-path auth guard: redirect to /login when the session cookie is absent.
// Signature verification (and redirect on a tampered/expired token) happens in
// the data layer (lib/session), which runs on the Node runtime with crypto.
export function middleware(req: NextRequest) {
  const hasToken = req.cookies.has("fl_token");
  const { pathname } = req.nextUrl;
  // Only guard the absence case here. We deliberately do NOT bounce /login → /
  // on mere cookie presence: the edge runtime can't verify the token, and a
  // stale-but-present cookie would loop with the data layer's redirect back to
  // /login (which then re-issues a valid cookie on the next sign-in).
  if (!hasToken && pathname !== "/login") return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}

// Exclude the API proxy (it does its own auth and must return JSON, not a login
// redirect) and public/PWA assets.
export const config = { matcher: ["/((?!api|_next/static|_next/image|favicon.ico|sw.js|offline.html|manifest.webmanifest|icon).*)"] };
