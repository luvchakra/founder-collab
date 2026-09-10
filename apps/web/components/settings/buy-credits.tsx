"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { BRAND_NAME } from "@cofounderai/core/lib/brand";

type CreditPlan = { key: string; label: string; credited_runs: number; amount_inr_paise: number };

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const CHECKOUT_SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

function loadCheckoutScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${CHECKOUT_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Could not load Razorpay checkout.")));
      return;
    }
    const script = document.createElement("script");
    script.src = CHECKOUT_SCRIPT_SRC;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Razorpay checkout."));
    document.body.appendChild(script);
  });
}

/**
 * Plan cards for "Buy monthly AI credits" -- Razorpay Checkout.js is loaded on demand
 * (not eagerly in the page's own <head>) since most visits to Billing never buy credits.
 * Flow: create-order route (server, resolves the account + creates the Razorpay order)
 * -> Checkout.js payment sheet -> verify route (server, checks the signature Checkout.js
 * hands back and credits the purchase) -> router.refresh() so the balance/history below
 * pick up the new state. The webhook route is the actual source of truth if this tab
 * closes mid-flow; this path is just for immediate feedback.
 */
export function BuyCredits({ plans, accountName }: { plans: CreditPlan[]; accountName: string }) {
  const router = useRouter();
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function buy(plan: CreditPlan) {
    setError(null);
    setPendingPlan(plan.key);
    try {
      await loadCheckoutScript();

      const orderResponse = await fetch("/api/billing/razorpay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey: plan.key }),
      });
      const order = await orderResponse.json();
      if (!orderResponse.ok) throw new Error(order.error ?? "Could not start checkout.");

      if (!window.Razorpay) throw new Error("Razorpay checkout failed to load.");
      const checkout = new window.Razorpay({
        key: order.razorpayKeyId,
        order_id: order.razorpayOrderId,
        amount: order.amountInrPaise,
        currency: "INR",
        name: BRAND_NAME,
        description: `${plan.label} -- ${plan.credited_runs} AI runs`,
        prefill: { name: accountName },
        handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
          try {
            const verifyResponse = await fetch("/api/billing/razorpay/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                purchaseId: order.purchaseId,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              }),
            });
            if (!verifyResponse.ok) {
              const body = await verifyResponse.json();
              throw new Error(body.error ?? "Payment could not be verified.");
            }
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong confirming your payment.");
          } finally {
            setPendingPlan(null);
          }
        },
        modal: { ondismiss: () => setPendingPlan(null) },
      });
      checkout.open();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPendingPlan(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        {plans.map((plan) => (
          <div key={plan.key} className="flex flex-col gap-3 rounded-lg border border-border p-4">
            <div>
              <p className="font-medium">{plan.label}</p>
              <p className="text-2xl font-semibold">₹{(plan.amount_inr_paise / 100).toLocaleString("en-IN")}</p>
              <p className="text-xs text-muted-foreground">{plan.credited_runs.toLocaleString("en-IN")} AI runs</p>
            </div>
            <Button size="sm" disabled={pendingPlan !== null} onClick={() => buy(plan)} className="w-full">
              <Sparkles className="size-3.5" aria-hidden="true" />
              {pendingPlan === plan.key ? "Opening checkout..." : "Buy"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
