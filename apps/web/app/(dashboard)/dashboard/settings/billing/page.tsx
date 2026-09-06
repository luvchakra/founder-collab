import Link from "next/link";
import { FREE_TIER_MONTHLY_COST_LIMIT_USD, FREE_TIER_MONTHLY_RUN_LIMIT } from "@cofounderai/module-discovery/lib/usage/limits";

/**
 * No payment processor is wired up yet (blueprint §22 -- MVP is free-tier only, see
 * lib/usage/limits.ts). This page exists so "Billing" has somewhere real to go from the
 * account menu instead of a dead link; it explains the current free-tier model rather
 * than implying a plan/payment flow that doesn't exist.
 */
export default function BillingSettingsPage() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 p-8">
      <div>
        <h1 className="text-xl font-semibold">Billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          co-founder-ai is currently free for every workspace -- there&apos;s no
          subscription or payment method to manage yet.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-md border p-4">
        <h2 className="font-medium">Free tier</h2>
        <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
          <li>Up to {FREE_TIER_MONTHLY_RUN_LIMIT} AI runs per workspace per month</li>
          <li>Up to ${FREE_TIER_MONTHLY_COST_LIMIT_USD} of AI spend per workspace per month</li>
          <li>Bring your own AI provider key -- you&apos;re billed directly by your provider</li>
        </ul>
        <Link
          href="/dashboard/settings/usage"
          className="self-start text-sm font-medium text-primary hover:underline"
        >
          View your current usage →
        </Link>
      </div>
    </main>
  );
}
