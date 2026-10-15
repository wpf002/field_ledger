import { cookies } from "next/headers";
import { TOKEN_COOKIE } from "./session";

// Server-side fetch needs an absolute origin (can't fetch a relative /api).
const API = process.env.API_URL ?? "http://localhost:4000";

/** Server-only fetch to the API that forwards the caller's session cookie,
 *  since /farms/:farmId routes require a session for reads too. */
export function apiFetch(path: string, init: RequestInit = {}) {
  const token = cookies().get(TOKEN_COOKIE)?.value;
  const headers = new Headers(init.headers);
  if (token) headers.set("cookie", `${TOKEN_COOKIE}=${token}`);
  return fetch(`${API}${path}`, { cache: "no-store", ...init, headers });
}
