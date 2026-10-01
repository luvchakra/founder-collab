"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import {
  confirmTotpEnrollmentAction,
  startTotpEnrollmentAction,
  type EnrollmentState,
} from "@/app/(dashboard)/dashboard/settings/security/actions";

export function MfaEnrollment() {
  const [enrollment, setEnrollment] = useState<EnrollmentState>(null);
  const [starting, startTransition] = useTransition();
  const [confirmState, confirmAction, confirming] = useActionState<EnrollmentState, FormData>(
    confirmTotpEnrollmentAction,
    null,
  );

  if (confirmState && "done" in confirmState) {
    return <p className="text-sm">Two-factor authentication is now on.</p>;
  }

  if (!enrollment || "error" in enrollment || "done" in enrollment) {
    return (
      <div className="flex flex-col gap-2">
        {enrollment && "error" in enrollment ? (
          <p role="alert" className="text-sm text-destructive">
            {enrollment.error}
          </p>
        ) : null}
        <Button
          className="self-start"
          disabled={starting}
          onClick={() => startTransition(async () => setEnrollment(await startTotpEnrollmentAction()))}
        >
          {starting ? "Preparing…" : "Set up authenticator app"}
        </Button>
      </div>
    );
  }

  return (
    <form action={confirmAction} className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Scan this QR code with an authenticator app (Google Authenticator, 1Password, Authy),
        then enter the 6-digit code it shows.
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element -- inline SVG data URI, not an optimizable remote image */}
      <img
        src={`data:image/svg+xml;utf-8,${encodeURIComponent(enrollment.qrCode)}`}
        alt="Authenticator QR code"
        className="size-44 rounded-md border bg-white p-2"
      />
      <p className="text-xs text-muted-foreground">
        Can&apos;t scan? Enter this key manually:{" "}
        <code className="break-all font-mono">{enrollment.secret}</code>
      </p>
      <input type="hidden" name="factorId" value={enrollment.factorId} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="code">Code</Label>
        <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required />
      </div>
      {confirmState && "error" in confirmState ? (
        <p role="alert" className="text-sm text-destructive">
          {confirmState.error}
        </p>
      ) : null}
      <Button type="submit" className="self-start" disabled={confirming}>
        {confirming ? "Verifying…" : "Turn on"}
      </Button>
    </form>
  );
}
