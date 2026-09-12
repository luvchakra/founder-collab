"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Button } from "../ui/button";
import type { LimitWarningCopy } from "../../entitlements/limit-warning-messaging";

/**
 * PLATFORM-P0-06.5 decision #3 (Warning Threshold) -- the "you're approaching your limit"
 * sibling of `LimitReachedNotice` (PLATFORM-P0-06.4), rendering `describeLimitWarning()`'s
 * own copy. Deliberately its own component rather than a `variant` prop bolted onto
 * `LimitReachedNotice`: the two represent genuinely different situations (nothing has been
 * denied here -- the action already succeeded, or would; this is a heads-up, not an
 * explanation of a block) and `LimitReachedNotice`'s own copy type
 * (`LimitReachedCopy`) is built from a *denied* decision, while this one only ever exists
 * for an *allowed* one -- keeping them as separate, small, single-purpose components
 * (mirroring `error-notice.tsx`'s own shape, same as `LimitReachedNotice` already does)
 * avoids a prop that silently changes what kind of decision a caller is allowed to pass in.
 *
 * Same default `Alert` variant `LimitReachedNotice` uses (no destructive styling -- nothing
 * has actually been denied), just a different icon and, unlike its sibling, no "Upgrade"
 * button: a warning is a heads-up on an action that already went through, not the
 * dead-end a denial is, so "View usage" is the one action that reliably makes sense here.
 * `usageHref` is optional and independent, same "never a dead link" rule
 * `LimitReachedNotice` already follows -- a caller with nowhere real to send it simply
 * omits the prop.
 */
export function LimitWarningNotice({ copy, usageHref }: { copy: LimitWarningCopy; usageHref?: string }) {
  return (
    <Alert>
      <AlertTriangle />
      <AlertTitle>{copy.title}</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <p>{copy.description}</p>
        {usageHref && (
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href={usageHref}>View usage</Link>
            </Button>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}
