import { redirect } from "next/navigation";
import { getCurrentAccount } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { getAiProviderConnection } from "@cofounderai/module-discovery/lib/ai-providers/queries";
import { AiSection } from "@/components/settings/ai-section";
import { PricingTiers } from "@/components/settings/pricing-tiers";
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

  const connection = await getAiProviderConnection(account.id);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 p-8">
      <div>
        <h1 className="text-xl font-semibold">Billing</h1>
      </div>

      <AiSection
        connection={connection}
        connectAction={connectProviderAction.bind(null, account.id)}
        disconnectAction={disconnectProviderAction.bind(null, account.id)}
      />

      <PricingTiers />
    </main>
  );
}
