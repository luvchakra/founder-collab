"use client";

import { useActionState } from "react";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import type { ConnectGoogleBusinessProfileActionState } from "./actions";

/**
 * CRM-08.5's connect form: the account id + location id together identify one Google
 * Business Profile location (Google's own location picker in a full OAuth flow would
 * hand these back; this is the same manual-paste path `crm/whatsapp/connect-form.tsx`
 * already established while no Embedded-Signup-equivalent exists here yet) plus an
 * access token already granted the Business Profile API scope.
 * `connectGoogleBusinessProfileLocation()` verifies all three against the real API
 * before ever storing anything.
 */
export function ConnectGoogleBusinessProfileForm({
  action,
}: {
  action: (state: ConnectGoogleBusinessProfileActionState, formData: FormData) => Promise<ConnectGoogleBusinessProfileActionState>;
}) {
  const [state, formAction] = useActionState<ConnectGoogleBusinessProfileActionState, FormData>(action, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="accountId">Account ID</Label>
        <Input id="accountId" name="accountId" placeholder="e.g. 106234567890123456789" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="locationId">Location ID</Label>
        <Input id="locationId" name="locationId" placeholder="e.g. 12345678901234567890" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="accessToken">Access token</Label>
        <Input id="accessToken" name="accessToken" type="password" placeholder="Google Business Profile API access token" required />
        <p className="text-xs text-muted-foreground">Encrypted at rest; never shown again once connected.</p>
      </div>
      {state?.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <SubmitButton pendingText="Connecting...">Connect location</SubmitButton>
    </form>
  );
}
