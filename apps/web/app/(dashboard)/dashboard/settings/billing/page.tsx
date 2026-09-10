import { redirect } from "next/navigation";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { getCurrentAccount } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { getAiProviderConnection } from "@cofounderai/module-discovery/lib/ai-providers/queries";
import { AI_PROVIDER_LABELS } from "@cofounderai/module-discovery/lib/ai-providers/types";
import { FREE_TIER_MONTHLY_COST_LIMIT_USD, FREE_TIER_MONTHLY_RUN_LIMIT } from "@cofounderai/module-discovery/lib/usage/limits";
import { AiProviderForm } from "@/components/settings/ai-provider-form";
import { PricingTiers } from "@/components/settings/pricing-tiers";
import { connectProviderAction, disconnectProviderAction } from "./actions";

/**
 * Everything AI-related lives under one "AI" section here now -- provider connection
 * (formerly its own /dashboard/settings/ai-provider page, redirected here) and the
 * included-credits fallback, which is now just the "App Internal AI" choice inside the
 * same provider picker (AiProviderForm) instead of a separate box/button next to it.
 * co-founder-ai is still free-tier-only by default (blueprint §22 -- no subscription, no
 * payment method requirement); Free is the only plan actually live, PricingTiers below
 * shows Pro/Max/Enterprise for comparison only.
 */
export default async function BillingSettingsPage() {
  const account = await getCurrentAccount();
  if (!account) redirect("/login");

  const connection = await getAiProviderConnection(account.id);
  const boundConnectAction = connectProviderAction.bind(null, account.id);
  const boundDisconnectAction = disconnectProviderAction.bind(null, account.id);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 p-8">
      <div>
        <h1 className="text-xl font-semibold">Billing</h1>
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

              <div className="border-t pt-4">
                <p className="mb-3 text-sm font-medium">Replace key</p>
                <AiProviderForm
                  action={boundConnectAction}
                  disconnectAction={boundDisconnectAction}
                  defaultProvider={connection.provider}
                  submitLabel="Replace key"
                />
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
                <AiProviderForm action={boundConnectAction} disconnectAction={boundDisconnectAction} submitLabel="Connect" />
              </div>
            </>
          )}
        </div>
      </section>

      <PricingTiers />
    </main>
  );
}
