"use client";

import { useSearchParams } from "next/navigation";

/**
 * The `?error=` a failed sign-in (or a dead auth link) lands back on /login with. Read
 * in the browser rather than from the page's `searchParams` so the page itself has
 * nothing to read at request time and is served as a static page from the CDN --
 * it's the first thing every returning founder loads, and it was a 1-2 s cold render.
 * Rendered inside a Suspense boundary: that's what lets a static page carry a
 * component whose output depends on the URL.
 */
export function LoginError() {
  const error = useSearchParams().get("error");
  if (!error) return null;
  return (
    <p role="alert" className="mt-4 text-sm text-destructive">
      {error}
    </p>
  );
}
