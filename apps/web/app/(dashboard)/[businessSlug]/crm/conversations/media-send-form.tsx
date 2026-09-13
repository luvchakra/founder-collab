"use client";

import { useActionState, useState } from "react";
import { ImagePlus } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import type { SendWhatsAppMediaActionState } from "./actions";

/**
 * Row 77's "CRM-07.6 media expansion" -- collapsed behind a small toggle by default so
 * it doesn't compete with the plain-text composer (`WhatsAppReplyForm`) for the
 * conversation's usual case. `mediaUrl` must already be a public URL -- see
 * `sendWhatsAppMedia()`'s own doc comment for why this doesn't add a file-upload step.
 */
export function WhatsAppMediaSendForm({
  action,
}: {
  action: (state: SendWhatsAppMediaActionState, formData: FormData) => Promise<SendWhatsAppMediaActionState>;
}) {
  const [state, formAction] = useActionState<SendWhatsAppMediaActionState, FormData>(action, null);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" size="sm" variant="ghost" className="self-start" onClick={() => setOpen(true)}>
        <ImagePlus className="mr-1.5 size-3.5" />
        Attach image
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="mediaUrl">Image URL</Label>
        <Input id="mediaUrl" name="mediaUrl" type="url" placeholder="https://..." required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="caption">Caption (optional)</Label>
        <Input id="caption" name="caption" placeholder="e.g. Here's the product you asked about" />
      </div>
      {state?.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <SubmitButton size="sm" pendingText="Sending...">
          Send image
        </SubmitButton>
      </div>
    </form>
  );
}
