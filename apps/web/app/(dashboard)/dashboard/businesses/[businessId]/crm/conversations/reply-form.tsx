"use client";

import { useActionState, useRef } from "react";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { Button } from "@cofounderai/core/ui/button";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import type { SendWhatsAppReplyActionState } from "./actions";

const SOURCE_LABELS: Record<string, string> = {
  party_contact_info: "contact info",
  product_interest: "product interest",
  discovery_research: "Discovery research",
  recent_orders: "recent orders",
  recent_jobs: "recent jobs",
};

/**
 * CRM-07.6's free-form WhatsApp reply composer -- shown only when CRM-07.7's 24-hour
 * window is open (the page itself decides that and renders `WindowClosedNotice` instead
 * when it's not, see page.tsx). Clears on a successful send by remounting via `key`
 * (the parent passes a fresh one per conversation/interaction-count so the textarea
 * doesn't carry stale text into the next conversation either).
 *
 * CRM-09.6's "AI Suggested Response" (draft only, `sources` names the real Customer 360
 * facts that informed it -- see draft-reply.ts's own doc comment) shows above the
 * textarea when the page computed one. "Use this draft" only fills the textarea via a
 * ref -- it never submits anything itself, so "user must explicitly send" and "user can
 * edit" both hold unchanged.
 */
export function WhatsAppReplyForm({
  action,
  suggestedDraft,
  suggestedDraftSources,
}: {
  action: (state: SendWhatsAppReplyActionState, formData: FormData) => Promise<SendWhatsAppReplyActionState>;
  suggestedDraft?: string | null;
  suggestedDraftSources?: string[];
}) {
  const [state, formAction] = useActionState<SendWhatsAppReplyActionState, FormData>(action, null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  return (
    <form action={formAction} className="flex flex-col gap-2 border-t border-border pt-3">
      {suggestedDraft ? (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-2">
          <p className="text-xs font-medium text-muted-foreground">
            AI suggested reply{suggestedDraftSources?.length ? ` -- based on ${suggestedDraftSources.map((s) => SOURCE_LABELS[s] ?? s).join(", ")}` : ""}
          </p>
          <p className="text-sm">{suggestedDraft}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="self-start"
            onClick={() => {
              if (textareaRef.current) textareaRef.current.value = suggestedDraft;
            }}
          >
            Use this draft
          </Button>
        </div>
      ) : null}
      <Textarea ref={textareaRef} name="text" placeholder="Type a WhatsApp reply..." rows={2} required />
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
