"use client";
import { useEffect } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Patches window.fetch once so every request to the API origin carries the
 *  session token as a Bearer header — no per-component wiring needed. */
export function FetchAuth() {
  useEffect(() => {
    const w = window as unknown as { __flPatched?: boolean };
    if (w.__flPatched) return;
    w.__flPatched = true;
    const orig = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith(API)) {
        const token = document.cookie.split("; ").find((c) => c.startsWith("fl_token="))?.slice("fl_token=".length);
        if (token) init = { ...init, headers: { ...(init?.headers as Record<string, string>), Authorization: `Bearer ${token}` } };
      }
      return orig(input, init);
    };
  }, []);
  return null;
}
