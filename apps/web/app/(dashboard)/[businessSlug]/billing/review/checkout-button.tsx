"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@cofounderai/core/ui/button";
import type { CheckoutResult } from "@cofounderai/core/billing/subscription-types";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const RAZORPAY_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = RAZORPAY_SCRIPT;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("load"));
    document.body.appendChild(script);
  });
}

/**
 * BILL-08 client half. Sends the plan, interval and an idempotency key made once per page
 * view -- so a double click, or a retry after a network blip, lands on the same checkout.
 * Returning from payment only ever leads to the success page, which waits for WonderArk's
 * own confirmation (BILL-11); nothing here marks anything paid.
 */
export function CheckoutButton({ businessSlug, planId, interval, free }: { businessSlug: string; planId: string; interval: "month" | "year"; free: boolean }) {
  const router = useRouter();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const successUrl = (sessionId: string) => `/${businessSlug}/billing/success?session=${encodeURIComponent(sessionId)}`;

  async function start() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessSlug, planId, billingInterval: interval, idempotencyKey }),
      });
      const body = (await response.json().catch(() => ({}))) as CheckoutResult & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "We couldn't start checkout. Please try again.");

      if (body.provider === "internal") {
        router.push(successUrl(body.sessionId));
        return;
      }
      if (body.provider === "stripe") {
        window.location.assign(body.url);
        return;
      }
      await loadRazorpay().catch(() => {
        throw new Error("The payment window couldn't load. Check your connection and try again.");
      });
      if (!window.Razorpay) throw new Error("The payment window couldn't load. Please try again.");
      const checkout = new window.Razorpay({
        ...body.checkoutOptions,
        theme: { color: "#2563eb" },
        handler: () => router.push(successUrl(body.sessionId)),
        modal: { ondismiss: () => setPending(false) },
      });
      checkout.open();
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't start checkout. Please try again.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={start} disabled={pending}>
        {pending ? "Starting…" : free ? "Activate free plan" : "Continue to payment"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
