"use client";

import { useActionState } from "react";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import type { AiReplyModeActionState } from "./actions";

/** PLATFORM-P1-12.5/12.6: the two ways WhatsApp AI replies go out. Labels are the ones the
 * help guide and the Conversations page use. */
export function AiReplyModeForm({
  action,
  mode,
}: {
  action: (state: AiReplyModeActionState, formData: FormData) => Promise<AiReplyModeActionState>;
  mode: "draft" | "auto";
}) {
  const [state, formAction] = useActionState<AiReplyModeActionState, FormData>(action, null);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="sr-only">AI replies</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="mode" value="draft" defaultChecked={mode === "draft"} />
          Draft for review
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="mode" value="auto" defaultChecked={mode === "auto"} />
          Send automatically
        </label>
      </fieldset>
      <p className="text-xs text-muted-foreground">
        Automatic replies answer only from your business details and products, inside WhatsApp&apos;s 24-hour window: at most 100 a day and 3 per conversation a day.
      </p>
      {state && "error" in state ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : state?.saved ? (
        <p className="text-sm text-muted-foreground">Saved.</p>
      ) : null}
      <SubmitButton size="sm" variant="outline" className="self-start" pendingText="Saving...">
        Save
      </SubmitButton>
    </form>
  );
}
