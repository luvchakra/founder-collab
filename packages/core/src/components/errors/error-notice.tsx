"use client";

import { Button } from "../ui/button";

/**
 * Generic "Something went wrong" error-boundary body -- the platform's shared
 * last-resort fallback for any `error.tsx`/`global-error.tsx` outside the dashboard
 * shell (auth, onboarding, the public token-based `/p/**` customer-facing routes).
 * Deliberately has no AI-specific logic, unlike `module-discovery`'s own
 * `AiErrorNotice` (which this mirrors the shape of) -- those routes have nothing to do
 * with AI providers/BYOK, and pulling that classification in here would be a stray
 * cross-module-flavored import for pages that aren't discovery's at all.
 *
 * Next.js redacts a thrown error's real message in production for errors that occur
 * during a Server Component's render (replacing it with a generic message plus a
 * `digest` correlating to the server-side log) -- `error.message` here is deliberately
 * still rendered rather than hidden, since when it IS the original message (a thrown
 * `Error` from a Server Action, which Next.js does NOT redact the same way), it's
 * usually the most specific, actionable text available; the redacted fallback text
 * itself is written to read fine standing alone either way.
 */
export function ErrorNotice({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        {error.message || "An unexpected error occurred. Please try again."}
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
