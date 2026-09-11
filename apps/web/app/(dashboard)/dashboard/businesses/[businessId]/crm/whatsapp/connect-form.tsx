"use client";

import { useActionState } from "react";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import type { WhatsAppConnectActionState } from "./actions";

/**
 * CRM-07.2's manual connect path: paste the phone_number_id + access token you already
 * obtained (via Meta's own App dashboard or, later, an Embedded Signup exchange this
 * form's own action can be swapped to call) -- `connectWhatsApp()` verifies them against
 * the real Graph API before ever storing anything, so a typo surfaces here, not at the
 * next customer message.
 */
export function ConnectWhatsAppForm({ action }: { action: (state: WhatsAppConnectActionState, formData: FormData) => Promise<WhatsAppConnectActionState> }) {
  const [state, formAction] = useActionState<WhatsAppConnectActionState, FormData>(action, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phoneNumberId">Phone number ID</Label>
        <Input id="phoneNumberId" name="phoneNumberId" placeholder="e.g. 109876543210123" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="accessToken">Access token</Label>
        <Input id="accessToken" name="accessToken" type="password" placeholder="Meta Cloud API access token" required />
        <p className="text-xs text-muted-foreground">Encrypted at rest; never shown again once connected.</p>
      </div>
      {state?.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <SubmitButton pendingText="Connecting...">Connect WhatsApp</SubmitButton>
    </form>
  );
}
