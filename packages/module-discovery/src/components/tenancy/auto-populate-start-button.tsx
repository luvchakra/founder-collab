"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import type { AiActionState } from "@cofounderai/core/actions/ai-action-state";
import { useAutoPopulateProgress } from "./auto-populate-progress";

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
 *
 * Styled as this page's most prominent action (a filled primary button, not the muted
 * text-link style every other trigger here uses) -- it's the one-click path that gets a
 * founder from nothing to a populated product, so it should read as *the* thing to do
 * first, not a minor option buried among "Regenerate"/"Add a file"/etc. `onPendingChange`
 * lets the page's own wrapper (product-overview-shell.tsx) disable every other control
 * while this runs, since it touches product/ICP/prospect data those controls also act on.
 */
export function AutoPopulateStartButton({
  action,
  disabled,
  disabledReason,
  nextHref,
  onPendingChange,
}: {
  action: (prevState: AiActionState, formData: FormData) => Promise<AiActionState>;
  disabled?: boolean;
  disabledReason?: string;
  nextHref: string;
  onPendingChange?: (pending: boolean) => void;
}) {
  const router = useRouter();
  const { setActiveStage } = useAutoPopulateProgress();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setPending(true);
    onPendingChange?.(true);
    setActiveStage("overview");
    setError(null);
    const form = new FormData();
    form.set("force", "true");
    const result = await action(null, form);
    if (result?.error) {
      setError(result.error);
      setPending(false);
      onPendingChange?.(false);
      setActiveStage(null);
      return;
    }
    setActiveStage(null);
    router.push(nextHref);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        type="button"
        onClick={run}
        disabled={disabled || pending}
        title={disabled ? disabledReason : undefined}
        className="self-start"
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Sparkles className="size-4" aria-hidden="true" />
        )}
        {pending ? "Populating overview..." : "Let AI Auto-Populate Info"}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
