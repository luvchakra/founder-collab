"use client";

import { useActionState } from "react";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import type { SendWhatsAppReplyActionState } from "./actions";

/**
 * CRM-07.6's free-form WhatsApp reply composer -- shown only when CRM-07.7's 24-hour
 * window is open (the page itself decides that and renders `WindowClosedNotice` instead
 * when it's not, see page.tsx). Clears on a successful send by remounting via `key`
 * (the parent passes a fresh one per conversation/interaction-count so the textarea
 * doesn't carry stale text into the next conversation either).
 */
export function WhatsAppReplyForm({ action }: { action: (state: SendWhatsAppReplyActionState, formData: FormData) => Promise<SendWhatsAppReplyActionState> }) {
  const [state, formAction] = useActionState<SendWhatsAppReplyActionState, FormData>(action, null);

  return (
    <form action={formAction} className="flex flex-col gap-2 border-t border-border pt-3">
      <Textarea name="text" placeholder="Type a WhatsApp reply..." rows={2} required />
      {state?.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <SubmitButton size="sm" pendingText="Sending..." className="self-end">
        Send
      </SubmitButton>
    </form>
  );
}
