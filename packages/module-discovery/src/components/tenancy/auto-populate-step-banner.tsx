"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAutoPopulateProgress, type AutoPopulateStage } from "./auto-populate-progress";

/**
 * Step 2 (ICP) or the terminal step 3 (Prospects) of the Overview -> ICP -> Prospects
 * auto-populate flow (see `AutoPopulateStartButton`'s own docstring for why this is a
 * separate component per page rather than one shared across the navigation). Renders
 * nothing unless the previous step's navigation carried `?autopopulate=1` -- an ordinary
 * visit to this page is completely unaffected. Runs `action` exactly once per mount (a
 * ref guard, not a dependency-array trick, since `action` is a fresh bound-server-action
 * reference on every render) and either advances to `nextPath` on success or shows the
 * failure in place, leaving the founder on this page rather than silently stalling.
 *
 * `nextPath` is a plain string, never a function -- a Server Component (this
 * component's only caller) can only pass a real `"use server"` action across into a
 * Client Component, not an ordinary closure; a `(result) => string` prop here would
 * throw at the RSC serialization boundary at runtime (it type-checks fine, since
 * TypeScript has no way to flag "this function isn't a server action").
 */
export function AutoPopulateStepBanner<T>({
  step,
  action,
  nextPath,
  resultQueryParam,
  runningLabel,
  replace = false,
}: {
  /** This step's own id -- reported to the shared auto-populate progress context (see
   * that file's own doc comment) so ProductNav can spin this stage's circle for exactly
   * as long as this banner is actually running. */
  step: AutoPopulateStage;
  action: () => Promise<T>;
  /** Plain pathname to navigate to on success (any static query the caller already
   * knows, e.g. "?autopopulate=1", is baked into this string literal). */
  nextPath: string;
  /** When set, the action's own result (a primitive) is appended to `nextPath` as
   * `<sep>${resultQueryParam}=<result>` -- lets the terminal step (Prospects) carry how
   * many prospects were actually added, without a function prop crossing the Server/
   * Client boundary. */
  resultQueryParam?: string;
  runningLabel: string;
  /** `router.replace` instead of `push` for the terminal step, so the auto-populate
   * flag doesn't linger in browser history once the flow is done. */
  replace?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const shouldRun = searchParams.get("autopopulate") === "1";
  const { setActiveStage } = useAutoPopulateProgress();
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!shouldRun || startedRef.current) return;
    startedRef.current = true;
    setActiveStage(step);
    (async () => {
      try {
        const result = await action();
        setActiveStage(null);
        const href = resultQueryParam
          ? `${nextPath}${nextPath.includes("?") ? "&" : "?"}${resultQueryParam}=${result}`
          : nextPath;
        if (replace) router.replace(href);
        else router.push(href);
      } catch (err) {
        setActiveStage(null);
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
      // action/nextPath/resultQueryParam/router/setActiveStage/step are intentionally
      // excluded -- re-running this effect on every new bound-action reference would
      // defeat the once-per-mount guard above.
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
