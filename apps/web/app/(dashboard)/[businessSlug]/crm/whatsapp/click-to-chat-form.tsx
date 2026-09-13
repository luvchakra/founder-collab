"use client";

import { useActionState } from "react";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import type { CreateClickToChatLinkActionState } from "./actions";

/** CRM-07.10: creates one attributable `wa.me` link -- same `useActionState` shape as
 * `AddWhatsAppTemplateForm` just above it on this page. */
export function CreateClickToChatLinkForm({ action }: { action: (state: CreateClickToChatLinkActionState, formData: FormData) => Promise<CreateClickToChatLinkActionState> }) {
  const [state, formAction] = useActionState<CreateClickToChatLinkActionState, FormData>(action, null);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ctcLabel">Label</Label>
        <Input id="ctcLabel" name="label" placeholder="e.g. Instagram bio link" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ctcWhatsappNumber">WhatsApp number</Label>
        <Input id="ctcWhatsappNumber" name="whatsappNumber" placeholder="e.g. 15551234567 (with country code, no +)" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ctcMessage">Pre-filled message</Label>
        <Input id="ctcMessage" name="message" placeholder="e.g. Hi! I'm interested in..." required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ctcCampaign">Product / source / campaign (optional)</Label>
        <Input id="ctcCampaign" name="campaign" placeholder="e.g. Spring sale - blue mugs" />
      </div>
      {state?.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <SubmitButton size="sm" variant="outline" pendingText="Creating..." className="self-start">
        Create link
      </SubmitButton>
    </form>
  );
}
