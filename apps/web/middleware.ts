import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Fast-path auth guard: redirect to /login when the session cookie is absent.
// Signature verification (and redirect on a tampered/expired token) happens in
// the data layer (lib/session), which runs on the Node runtime with crypto.
export function middleware(req: NextRequest) {
  const hasToken = req.cookies.has("fl_token");
  const { pathname } = req.nextUrl;
  if (!hasToken && pathname !== "/login") return NextResponse.redirect(new URL("/login", req.url));
  if (hasToken && pathname === "/login") return NextResponse.redirect(new URL("/", req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
