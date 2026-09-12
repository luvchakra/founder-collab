"use client";

import Link from "next/link";
import { Gauge } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Button } from "../ui/button";
import type { LimitReachedCopy } from "../../entitlements/limit-reached-messaging";

/**
 * PLATFORM-P0-06.4 ("Graceful Limit UX") -- the shared presentational rendering of
 * `describeLimitReached()`'s own copy, matching the doc's own worked example:
 *
 *   You've reached your Pro plan limit of 100 active opportunities.
 *   [Upgrade] [View Usage]
 *
 * Mirrors `packages/core/src/components/errors/error-notice.tsx`'s own shape (a small,
 * self-contained, reusable presentational component built on the existing `Alert`/
 * `Button` primitives, not a full page) -- this is the "graceful" half of enforcement:
 * `canConsume()`/`getLimit()` (PLATFORM-P0-06.3) are what actually deny the action;
 * this is only how a caller that received that denial explains it to the person who hit
 * it, in the platform's own design system rather than each module inventing its own
 * wording or layout for the same situation.
 *
 * `upgradeHref`/`usageHref` are both optional and independent -- a caller that has
 * nowhere real to send "Upgrade" (no plan-change flow exists yet, PLATFORM-P1-04.1) or
 * "View Usage" (no tenant-facing usage page exists yet, see `usage/dashboard.ts`'s own
 * docstring for exactly why) simply omits that prop and the corresponding button doesn't
 * render at all -- never a dead link, per this codebase's "every visual element has a
 * purpose" design rule. A future module page that adds either destination passes its own
 * real route in; this component has no opinion on what those routes are.
 */
export function LimitReachedNotice({
  copy,
  upgradeHref,
  usageHref,
}: {
  copy: LimitReachedCopy;
  upgradeHref?: string;
  usageHref?: string;
}) {
  return (
    <Alert>
      <Gauge />
      <AlertTitle>{copy.title}</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <p>{copy.description}</p>
        {(upgradeHref || usageHref) && (
          <div className="flex flex-wrap gap-2">
            {upgradeHref && (
              <Button asChild size="sm">
                <Link href={upgradeHref}>Upgrade</Link>
              </Button>
            )}
            {usageHref && (
              <Button asChild size="sm" variant="outline">
                <Link href={usageHref}>View usage</Link>
              </Button>
            )}
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}
