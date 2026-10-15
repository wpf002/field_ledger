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
  if (!hasToken && pathname !== "/login") {
    // Come back here after signing in (e.g. the OAuth consent screen).
    const to = new URL("/login", req.url);
    if (pathname !== "/") to.searchParams.set("next", pathname + req.nextUrl.search);
    return NextResponse.redirect(to);
  }
  // Let the layout know the path so standalone screens skip the app shell.
  const headers = new Headers(req.headers);
  headers.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers } });
}

// Exclude the API proxy (it does its own auth and must return JSON, not a login
// redirect) and public/PWA assets.
export const config = { matcher: ["/((?!api|\\.well-known|_next/static|_next/image|favicon.ico|sw.js|offline.html|manifest.webmanifest|icon).*)"] };
