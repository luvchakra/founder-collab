import { redirect } from "next/navigation";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { getCurrentAccount } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { getAiProviderConnection } from "@cofounderai/module-discovery/lib/ai-providers/queries";
import { AI_PROVIDER_LABELS } from "@cofounderai/module-discovery/lib/ai-providers/types";
import { FREE_TIER_MONTHLY_COST_LIMIT_USD, FREE_TIER_MONTHLY_RUN_LIMIT } from "@cofounderai/module-discovery/lib/usage/limits";
import { CREDIT_PLANS } from "@cofounderai/core/billing/plans";
import { getCreditBalance, listCreditPurchases } from "@cofounderai/core/billing/queries";
import { Badge } from "@cofounderai/core/ui/badge";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { AiProviderForm } from "@/components/settings/ai-provider-form";
import { BuyCredits } from "@/components/settings/buy-credits";
import { PricingTiers } from "@/components/settings/pricing-tiers";
import { connectProviderAction, disconnectProviderAction } from "./actions";

/**
 * Everything AI-related lives under one "AI" section here now -- provider connection
 * (formerly its own /dashboard/settings/ai-provider page, redirected here), the included-
 * credits fallback, buying more credits, and purchase history. co-founder-ai is still
 * free-tier-only by default (blueprint §22 -- no subscription, no payment method
 * requirement); Free is the only plan actually live, PricingTiers below shows Pro/Max/
 * Enterprise for comparison only.
 */
export default async function BillingSettingsPage() {
  const account = await getCurrentAccount();
  if (!account) redirect("/login");

  const [connection, balance, purchases] = await Promise.all([
    getAiProviderConnection(account.id),
    getCreditBalance(account.id),
    listCreditPurchases(account.id),
  ]);
  const boundConnectAction = connectProviderAction.bind(null, account.id);
  const razorpayConfigured = Boolean(process.env.RAZORPAY_KEY_ID);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 p-8">
      <div>
        <h1 className="text-xl font-semibold">Billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          co-founder-ai is free today -- Free is the only plan you can actually be on
          right now. Manage your AI provider and credits below, or see where Pro and Max
          are headed further down.
        </p>
      </div>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold">AI</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {connection
              ? "AI features run on your own connected provider account and your own API key -- your usage bills directly to your provider, with no monthly cap from us."
              : "AI features currently run on CoFounderAI's included credits, capped at a modest free-tier allowance each month. Connect your own provider key any time to bypass that cap."}
          </p>
        </div>

        <div className="flex max-w-lg flex-col gap-4 rounded-md border p-4">
          {connection ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{AI_PROVIDER_LABELS[connection.provider]}</p>
                  <p className="text-sm text-muted-foreground">••••••••••••{connection.keyFingerprint}</p>
                </div>
                {connection.status === "connected" ? (
                  <span className="text-sm text-emerald-600">✓ Connected</span>
                ) : (
                  <span className="text-sm text-destructive">Connection error</span>
                )}
              </div>
              {connection.lastError ? <p className="text-sm text-destructive">{connection.lastError}</p> : null}

              <div className="flex flex-col gap-2 rounded-md border border-dashed p-3">
                <p className="text-sm font-medium">Use CoFounderAI&apos;s included credits instead</p>
                <p className="text-xs text-muted-foreground">
                  Switch off your own key and fall back to our free tier -- up to{" "}
                  {FREE_TIER_MONTHLY_RUN_LIMIT} AI runs (${FREE_TIER_MONTHLY_COST_LIMIT_USD} of spend)
                  per workspace per month, no key required.
                </p>
                <form action={disconnectProviderAction.bind(null, account.id)}>
                  <SubmitButton variant="outline" size="sm" pendingText="Switching..." className="self-start">
                    <Sparkles className="size-3.5" aria-hidden="true" />
                    Use included credits
                  </SubmitButton>
                </form>
              </div>

              <div className="border-t pt-4">
                <p className="mb-3 text-sm font-medium">Replace key</p>
                <AiProviderForm action={boundConnectAction} defaultProvider={connection.provider} submitLabel="Replace key" />
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-2 rounded-md border border-dashed p-3">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
                  Using CoFounderAI&apos;s included credits
                </p>
                <p className="text-xs text-muted-foreground">
                  No key connected -- AI features run on our free tier, up to{" "}
                  {FREE_TIER_MONTHLY_RUN_LIMIT} AI runs (${FREE_TIER_MONTHLY_COST_LIMIT_USD} of spend)
                  per workspace per month.
                </p>
                <Link href="/dashboard/settings/usage" className="self-start text-xs font-medium text-primary hover:underline">
                  View your current usage →
                </Link>
              </div>

              <div>
                <p className="mb-3 text-sm font-medium">Bring your own key (optional)</p>
                <AiProviderForm action={boundConnectAction} submitLabel="Connect" />
              </div>
            </>
          )}
        </div>

        <div className="flex max-w-lg flex-col gap-4 rounded-md border p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">AI credits</h3>
            <Badge variant="secondary">{balance.remaining_runs} run{balance.remaining_runs === 1 ? "" : "s"} remaining</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Purchased runs are spent automatically once a workspace goes past its free-tier
            allowance for the month -- no setup required, they just extend the cap.
          </p>

          {razorpayConfigured ? (
            <BuyCredits plans={CREDIT_PLANS} accountName={account.name} />
          ) : (
            <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
              Buying credits isn&apos;t available on this deployment yet -- it needs a
              Razorpay account connected (RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET).
            </p>
          )}
        </div>

        {purchases.length > 0 ? (
          <div className="flex max-w-lg flex-col gap-3 rounded-md border p-4">
            <h3 className="font-medium">Purchase history</h3>
            <div className="flex flex-col divide-y">
              {purchases.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
                  <div>
                    <p className="font-medium capitalize">{p.plan_key} -- {p.credited_runs} runs</p>
                    <p className="text-xs text-muted-foreground">
                      ₹{(p.amount_inr_paise / 100).toLocaleString("en-IN")} · {new Date(p.created_at).toLocaleDateString("en-IN")}
                    </p>
                  </div>
                  <Badge variant={p.status === "paid" ? "secondary" : p.status === "failed" ? "destructive" : "outline"}>
                    {p.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <PricingTiers />
    </main>
  );
}
