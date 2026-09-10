import { redirect } from "next/navigation";
import { getCurrentAccount } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { getAiProviderConnection } from "@cofounderai/module-discovery/lib/ai-providers/queries";
import { FREE_TIER_MONTHLY_COST_LIMIT_USD, FREE_TIER_MONTHLY_RUN_LIMIT } from "@cofounderai/module-discovery/lib/usage/limits";
import { getCreditBalance, listCreditPurchases } from "@cofounderai/core/billing/queries";
import { CREDIT_PLANS } from "@cofounderai/core/billing/plans";
import { AiSection } from "@/components/settings/ai-section";
import { PricingTiers } from "@/components/settings/pricing-tiers";
import { BuyCredits } from "@/components/settings/buy-credits";
import { CreditPurchaseHistory } from "@/components/settings/credit-purchase-history";
import { connectProviderAction, disconnectProviderAction } from "./actions";

/**
 * Everything AI-related lives in one collapsible "AI" card here (AiSection) -- provider
 * connection (formerly its own /dashboard/settings/ai-provider page, redirected here)
 * and the included-credits fallback, which is just the "App Internal AI" choice inside
 * the same provider picker instead of a separate box/button. co-founder-ai is still
 * free-tier-only by default (blueprint §22 -- no subscription, no payment method
 * requirement); Free is the only plan actually live, PricingTiers below shows Pro/Max/
 * Enterprise for comparison only.
 */
export default async function BillingSettingsPage() {
  const account = await getCurrentAccount();
  if (!account) redirect("/login");

  const [connection, creditBalance, creditPurchases] = await Promise.all([
    getAiProviderConnection(account.id),
    getCreditBalance(account.id),
    listCreditPurchases(account.id),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 p-8">
      <div>
        <h1 className="text-xl font-semibold">Billing</h1>
      </div>

      <AiSection
        connection={connection}
        connectAction={connectProviderAction.bind(null, account.id)}
        disconnectAction={disconnectProviderAction.bind(null, account.id)}
        freeTierRunLimit={FREE_TIER_MONTHLY_RUN_LIMIT}
        freeTierCostLimitUsd={FREE_TIER_MONTHLY_COST_LIMIT_USD}
      />

      <section className="flex flex-col gap-4 rounded-xl border border-border p-4">
        <div>
          <h2 className="text-lg font-semibold">AI credits</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Spent automatically once a workspace uses up its free monthly allowance ({FREE_TIER_MONTHLY_RUN_LIMIT}{" "}
            runs or ${FREE_TIER_MONTHLY_COST_LIMIT_USD} of AI spend, whichever comes first) -- shared across every
            business and product on this account.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Remaining balance</p>
          <p className="mt-1 text-2xl font-semibold">{creditBalance.remaining_runs.toLocaleString("en-IN")} runs</p>
        </div>
        <BuyCredits plans={CREDIT_PLANS} accountName={account.name} />
        <CreditPurchaseHistory purchases={creditPurchases} />
      </section>

      <PricingTiers />
    </main>
  );
}
