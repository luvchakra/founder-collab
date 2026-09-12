"use client";

import { RefreshCw } from "lucide-react";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";

/**
 * DISC-OFFER-P0-11.1/11.2: the doc's own "[Save] [Save & Run Downstream]" pair, and its
 * own "user receives a clear warning before downstream results are replaced" acceptance
 * criterion -- a second submit button inside the same `<form>`, using the standard HTML
 * `formAction` override so one form can submit to either server action depending on
 * which button was clicked, with a native `confirm()` naming exactly which
 * founder-facing pipeline groups will be reset (DISC-OFFER-P0-11.3's own
 * `downstreamGroupLabels`) before the submission is allowed through. Generic over any
 * edit surface's own "run downstream" action -- the ICP page (this story's own worked
 * example) is the first adopter; buyer personas/discovery strategy/offering profile can
 * reuse this same component once their own edit surfaces adopt the same pattern.
 */
export function SaveAndRunDownstreamButton({
  formAction,
  affectedLabels,
}: {
  formAction: (formData: FormData) => void | Promise<void>;
  affectedLabels: string[];
}) {
  return (
    <SubmitButton
      type="submit"
      variant="outline"
      size="sm"
      formAction={formAction}
      pendingText="Saving..."
      onClick={(event) => {
        const message =
          affectedLabels.length > 0
            ? `This will reset and rerun:\n\n${affectedLabels.map((l) => `• ${l}`).join("\n")}\n\nContinue?`
            : "Save this change?";
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      <RefreshCw className="size-3.5" />
      Save &amp; Run Downstream
    </SubmitButton>
  );
}
