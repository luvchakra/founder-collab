"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * Step 2 (ICP) or the terminal step 3 (Prospects) of the Overview -> ICP -> Prospects
 * auto-populate flow (see `AutoPopulateStartButton`'s own docstring for why this is a
 * separate component per page rather than one shared across the navigation). Renders
 * nothing unless the previous step's navigation carried `?autopopulate=1` -- an ordinary
 * visit to this page is completely unaffected. Runs `action` exactly once per mount (a
 * ref guard, not a dependency-array trick, since `action` is a fresh bound-server-action
 * reference on every render) and either advances to `nextHref` on success or shows the
 * failure in place, leaving the founder on this page rather than silently stalling.
 */
export function AutoPopulateStepBanner<T>({
  action,
  nextHref,
  runningLabel,
  replace = false,
}: {
  action: () => Promise<T>;
  /** Called with the action's own result to build the next URL -- lets the terminal
   * step (Prospects) carry how many prospects were actually added into its own query
   * string. */
  nextHref: (result: T) => string;
  runningLabel: string;
  /** `router.replace` instead of `push` for the terminal step, so the auto-populate
   * flag doesn't linger in browser history once the flow is done. */
  replace?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const shouldRun = searchParams.get("autopopulate") === "1";
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!shouldRun || startedRef.current) return;
    startedRef.current = true;
    (async () => {
      try {
        const result = await action();
        const href = nextHref(result);
        if (replace) router.replace(href);
        else router.push(href);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
      // action/nextHref/router are intentionally excluded -- re-running this effect on
      // every new bound-action reference would defeat the once-per-mount guard above.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })();
  }, [shouldRun]);

  if (!shouldRun) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
      {error ? (
        <p className="text-destructive">{error}</p>
      ) : (
        <>
          <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden="true" />
          <p>{runningLabel}</p>
        </>
      )}
    </div>
  );
}
