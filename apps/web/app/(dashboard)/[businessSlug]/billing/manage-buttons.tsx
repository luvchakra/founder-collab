"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@cofounderai/core/ui/button";
import { manageBillingAction, resumeSubscriptionAction } from "./actions";

/** BILL-21 -- "Manage billing" opens the provider's own page for payment methods and
 * invoices (Stripe's customer portal, or Razorpay's hosted subscription page). */
export function ManageBillingButton({
  businessSlug,
  label,
  variant = "default",
}: {
  businessSlug: string;
  label: string;
  variant?: "default" | "outline";
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <Button
        variant={variant}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await manageBillingAction(businessSlug);
            if (result && !result.ok) setError(result.error);
          })
        }
      >
        {pending ? "Opening…" : label}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ResumeButton({ businessSlug }: { businessSlug: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await resumeSubscriptionAction(businessSlug);
            if (!result.ok) setError(result.error);
            else router.refresh();
          })
        }
      >
        {pending ? "Keeping…" : "Keep my plan"}
      </Button>
      {error ? (
        <p role="alert" className="max-w-xs text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
