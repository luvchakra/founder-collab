"use client";

import { useActionState } from "react";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import type { GatewayFormState } from "@/app/(dashboard)/dashboard/settings/billing/actions";

type BoundAction = (prev: GatewayFormState, formData: FormData) => Promise<GatewayFormState>;

/** Secrets are write-only: the inputs are always empty, and saving replaces whatever
 * was stored. Nothing secret is ever sent back to the browser. */
export function GatewayAccountForm({
  provider,
  webhookUrl,
  action,
}: {
  provider: "stripe" | "razorpay";
  webhookUrl: string;
  action: BoundAction;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const id = (field: string) => `${provider}-${field}`;

  return (
    <form action={formAction} className="flex flex-col gap-3" autoComplete="off">
      {provider === "razorpay" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id("keyId")}>Key id</Label>
          <Input id={id("keyId")} name="keyId" placeholder="rzp_live_…" required />
        </div>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id("secret")}>{provider === "stripe" ? "Secret key (or restricted key)" : "Key secret"}</Label>
        <Input id={id("secret")} name="secret" type="password" placeholder={provider === "stripe" ? "sk_live_…" : ""} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id("webhookSecret")}>Webhook signing secret</Label>
        <Input id={id("webhookSecret")} name="webhookSecret" type="password" placeholder={provider === "stripe" ? "whsec_…" : ""} required />
        <p className="text-xs text-muted-foreground">
          Create a webhook in your {provider === "stripe" ? "Stripe" : "Razorpay"} dashboard pointing to{" "}
          <code className="break-all font-mono">{webhookUrl}</code> with the{" "}
          {provider === "stripe"
            ? "checkout.session.completed and checkout.session.async_payment_succeeded events"
            : "payment_link.paid event"}
          .
        </p>
      </div>
      {state && "error" in state ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {state && "success" in state ? <p className="text-sm text-muted-foreground">Saved.</p> : null}
      <Button type="submit" size="sm" className="self-start" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
