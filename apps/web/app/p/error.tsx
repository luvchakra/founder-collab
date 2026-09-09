"use client";

import { ErrorNotice } from "@cofounderai/core/errors/error-notice";

/** These are the platform's only unauthenticated, customer-facing routes (public
 * estimate/invoice/customer-center links) -- CLAUDE.md's own note on why they get
 * dedicated security-focused test cases applies just as much to error handling: a
 * customer clicking a link from an email should never land on Next.js's bare default
 * error page, which is what happened here before this boundary existed at all. */
export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorNotice error={error} reset={reset} />;
}
