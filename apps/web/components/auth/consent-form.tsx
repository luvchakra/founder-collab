"use client";

import { useActionState } from "react";
import { Button } from "@cofounderai/core/ui/button";
import { acceptNoticeAction, type ConsentFormState } from "@/app/consent/actions";

export function ConsentForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<ConsentFormState, FormData>(acceptNoticeAction, null);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="acceptPrivacy" required className="mt-1" />
        <span>I&apos;m 18 or older and I&apos;ve read the privacy notice.</span>
      </label>
      <label className="flex items-start gap-2 text-sm text-muted-foreground">
        <input type="checkbox" name="marketingConsent" className="mt-1" />
        <span>Send me occasional product updates (optional).</span>
      </label>
      {state?.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Continue"}
      </Button>
    </form>
  );
}
