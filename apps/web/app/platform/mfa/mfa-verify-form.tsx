"use client";

import { useActionState } from "react";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { verifyMfaCode, type MfaVerifyState } from "./actions";

/**
 * PLATFORM-P0-18.1's code-entry step, shared by both the first-time-enrollment view and
 * the returning-superadmin re-challenge view (`page.tsx` decides which surrounding copy/
 * QR code to show; this form only ever needs a factor id and a 6-digit code either way).
 *
 * A plain numeric `<Input>` per the story's own "simplest thing that works" -- not the
 * vendored `input-otp` component (packages/core/src/components/ui/input-otp.tsx), which
 * would add multi-box-focus-management complexity this one low-traffic admin-only screen
 * doesn't need.
 */
export function MfaVerifyForm({ factorId }: { factorId: string }) {
  const [state, formAction] = useActionState<MfaVerifyState, FormData>(verifyMfaCode, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="factorId" value={factorId} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="code">6-digit code</Label>
        <Input
          id="code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          placeholder="000000"
          required
          autoFocus
        />
      </div>
      {state?.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <SubmitButton pendingText="Verifying…">Verify and continue</SubmitButton>
    </form>
  );
}
