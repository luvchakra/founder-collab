"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import type { AiActionState } from "@cofounderai/core/actions/ai-action-state";

/**
 * The Overview page's "Let AI Auto-Populate Info" trigger -- step 1 of 3 of the
 * Overview -> ICP -> Prospects auto-populate flow. Runs the product-profile generation
 * itself (same action the plain "Regenerate" button elsewhere on this page calls), then
 * navigates to the ICP page with `?autopopulate=1` so that page's own
 * `IcpAutoPopulateStep` picks up where this one left off -- each page runs and shows its
 * own step because a client component's state doesn't survive a route change, so the
 * flow can't be one long-lived component spanning three pages; it's three cooperating
 * ones instead, each triggered by the query flag the previous page's navigation carried
 * forward.
 */
export function AutoPopulateStartButton({
  action,
  disabled,
  disabledReason,
  nextHref,
}: {
  action: (prevState: AiActionState, formData: FormData) => Promise<AiActionState>;
  disabled?: boolean;
  disabledReason?: string;
  nextHref: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setPending(true);
    setError(null);
    const form = new FormData();
    form.set("force", "true");
    const result = await action(null, form);
    if (result?.error) {
      setError(result.error);
      setPending(false);
      return;
    }
    router.push(nextHref);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={run}
        disabled={disabled || pending}
        title={disabled ? disabledReason : undefined}
        className="flex items-center gap-1.5 self-start text-sm font-medium text-muted-foreground transition-colors hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Sparkles className="size-3.5" aria-hidden="true" />
        )}
        {pending ? "Populating overview..." : "Let AI Auto-Populate Info"}
      </button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
