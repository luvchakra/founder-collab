"use client";

import { useState } from "react";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { Textarea } from "@cofounderai/core/ui/textarea";
import type { WorkRequestInput } from "../../lib/work-requests/types";

/** `/p/request/[businessSlug]`'s own form -- embeddable (a plain page with no app shell,
 * meant to be linked to or iframed), no auth, no client-side validation library (just the
 * one required field). Spam protection and custom fields are explicit SHOULD/LATER items
 * (PRD §2 Contact form row) -- not built. */
export function ContactForm({ businessName, submitAction }: { businessName: string; submitAction: (input: WorkRequestInput) => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-2 p-10 text-center">
        <h1 className="text-lg font-semibold">Thanks!</h1>
        <p className="text-sm text-muted-foreground">{businessName} will be in touch shortly.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Request service from {businessName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Tell us a bit about what you need -- we will reach out to schedule.</p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <form
        className="flex flex-col gap-4"
        action={async (form: FormData) => {
          const input: WorkRequestInput = {
            name: String(form.get("name") ?? ""),
            email: String(form.get("email") ?? "") || undefined,
            phone: String(form.get("phone") ?? "") || undefined,
            addressText: String(form.get("address") ?? "") || undefined,
            message: String(form.get("message") ?? "") || undefined,
          };
          setError(null);
          try {
            await submitAction(input);
            setSubmitted(true);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong.");
          }
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" type="tel" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="address">Service address</Label>
          <Input id="address" name="address" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="message">What do you need help with?</Label>
          <Textarea id="message" name="message" rows={4} />
        </div>
        <SubmitButton pendingText="Sending...">Send request</SubmitButton>
      </form>
    </div>
  );
}
