import Link from "next/link";
import { redirect } from "next/navigation";
import { FREE_TIER_MONTHLY_COST_LIMIT_USD, FREE_TIER_MONTHLY_RUN_LIMIT } from "@cofounderai/module-discovery/lib/usage/limits";
import { getCurrentAccount, listBusinesses } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { moduleRegistry } from "@cofounderai/module-registry";
import { hasPermission } from "@cofounderai/core/finance/controls";
import { SITE_URL } from "@cofounderai/core/site";
import { configuredPlatformProviders } from "@cofounderai/core/billing/config";
import { listActivePrices, listSubscriptionsForBusiness } from "@cofounderai/core/billing/subscriptions";
import { gatewayWebhookPath, listGatewayAccounts } from "@cofounderai/core/billing/collections";
import type { BillingPrice, Subscription } from "@cofounderai/core/billing/types";
import { Badge } from "@cofounderai/core/ui/badge";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { GatewayAccountForm } from "@/components/settings/gateway-account-form";
import {
  cancelSubscriptionAction,
  removeGatewayAccountAction,
  saveGatewayAccountAction,
  subscribeAction,
} from "./actions";

const PROVIDER_LABEL = { stripe: "Card (Stripe)", razorpay: "UPI / card / netbanking (Razorpay)" } as const;

function formatPrice(price: BillingPrice): string {
  const amount = new Intl.NumberFormat("en", { style: "currency", currency: price.currency }).format(price.amount_minor / 100);
  return `${amount} / ${price.billing_interval}`;
}

function SubscriptionBadge({ sub }: { sub: Subscription }) {
  if (sub.status === "active") {
    return <Badge>{sub.cancel_at_period_end ? "Cancels at period end" : "Active"}</Badge>;
  }
  if (sub.status === "past_due") return <Badge variant="destructive">Payment overdue</Badge>;
  if (sub.status === "incomplete") return <Badge variant="outline">Awaiting payment</Badge>;
  return <Badge variant="secondary">{sub.status}</Badge>;
}

/**
 * Platform billing (module subscriptions via Stripe or Razorpay) and per-business
 * gateway setup for collecting from customers. Every mutation authorizes
 * billing.manage server-side; licenses only change from signed provider webhooks.
 */
export default async function BillingSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const account = await getCurrentAccount();
  if (!account) redirect("/login");
  const { checkout } = await searchParams;

  const [businesses, prices] = await Promise.all([listBusinesses(account.id), listActivePrices()]);
  const providers = configuredPlatformProviders();
  const sellablePrices = prices.filter((p) => providers.includes(p.provider));
  // Canonical URL, never a request header: this is the address a business pastes into
  // its gateway dashboard, so it must be the real deployment (set NEXT_PUBLIC_SITE_URL).
  const origin = SITE_URL;

  const perBusiness = await Promise.all(
    businesses.map(async (business) => {
      const canManage = await hasPermission(business.id, "billing.manage");
      const [subscriptions, gateways] = await Promise.all([
        listSubscriptionsForBusiness(business.id),
        canManage ? listGatewayAccounts(business.id) : Promise.resolve([]),
      ]);
      return { business, canManage, subscriptions, gateways };
    }),
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-8">
      <div>
        <h1 className="text-xl font-semibold">Billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Subscribe to modules for each business, and connect a payment gateway to collect
          from your own customers.
        </p>
      </div>

      {checkout === "success" ? (
        <p role="status" className="rounded-md border bg-accent p-3 text-sm">
          Thanks -- your payment is being confirmed. The module activates as soon as the
          payment provider confirms it, usually within a minute.
        </p>
      ) : null}

      {sellablePrices.length === 0 ? (
        <section className="flex flex-col gap-3 rounded-md border p-4">
          <h2 className="font-medium">Free tier</h2>
          <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
            <li>Up to {FREE_TIER_MONTHLY_RUN_LIMIT} AI runs per workspace per month</li>
            <li>Up to ${FREE_TIER_MONTHLY_COST_LIMIT_USD} of AI spend per workspace per month</li>
            <li>Bring your own AI provider key -- you&apos;re billed directly by your provider</li>
          </ul>
          <p className="text-sm text-muted-foreground">
            Paid plans aren&apos;t enabled on this deployment yet; modules are managed on the{" "}
            <Link href="/dashboard/settings/licenses" className="font-medium text-primary hover:underline">
              Licenses
            </Link>{" "}
            page.
          </p>
        </section>
      ) : null}

      {perBusiness.map(({ business, canManage, subscriptions, gateways }) => (
        <section key={business.id} className="flex flex-col gap-4">
          <h2 className="font-medium">{business.name}</h2>

          {sellablePrices.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {moduleRegistry
                .filter((module) => sellablePrices.some((p) => p.module_key === module.key))
                .map((module) => {
                  const live = subscriptions.find(
                    (s) => s.module_key === module.key && ["active", "past_due", "incomplete"].includes(s.status),
                  );
                  const modulePrices = sellablePrices.filter((p) => p.module_key === module.key);
                  return (
                    <div key={module.key} className="flex flex-col gap-3 rounded-md border p-4">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium">{module.name}</span>
                        {live ? <SubscriptionBadge sub={live} /> : null}
                      </div>
                      {live?.current_period_end ? (
                        <p className="text-xs text-muted-foreground">
                          {live.cancel_at_period_end ? "Access until" : "Renews"}{" "}
                          {new Date(live.current_period_end).toLocaleDateString()}
                        </p>
                      ) : null}
                      {!canManage ? (
                        <p className="text-xs text-muted-foreground">Ask an owner or admin to manage this subscription.</p>
                      ) : live && live.status !== "incomplete" ? (
                        live.cancel_at_period_end ? null : (
                          <form action={cancelSubscriptionAction.bind(null, business.id, module.key)}>
                            <SubmitButton variant="outline" size="sm" pendingText="Cancelling...">
                              Cancel subscription
                            </SubmitButton>
                          </form>
                        )
                      ) : (
                        modulePrices.map((price) => (
                          <form key={price.id} action={subscribeAction.bind(null, business.id, price.id)}>
                            <SubmitButton size="sm" pendingText="Redirecting..." className="w-full justify-between">
                              <span>{formatPrice(price)}</span>
                              <span className="text-xs opacity-80">{PROVIDER_LABEL[price.provider]}</span>
                            </SubmitButton>
                          </form>
                        ))
                      )}
                    </div>
                  );
                })}
            </div>
          ) : null}

          {canManage ? (
            <details className="rounded-md border p-4">
              <summary className="cursor-pointer font-medium">Collect payments from your customers</summary>
              <p className="mt-2 text-sm text-muted-foreground">
                Connect your own Stripe or Razorpay account to send customers a payment link
                for an invoice. Money goes straight to your account; paid invoices are recorded
                and reconciled automatically. Keys are encrypted at rest and never shown again.
              </p>
              <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2">
                {(["razorpay", "stripe"] as const).map((provider) => {
                  const connected = gateways.find((g) => g.provider === provider);
                  return (
                    <div key={provider} className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium">{provider === "stripe" ? "Stripe" : "Razorpay"}</h3>
                        {connected ? <Badge>Connected · …{connected.secret_fingerprint}</Badge> : <Badge variant="outline">Not connected</Badge>}
                      </div>
                      <GatewayAccountForm
                        provider={provider}
                        webhookUrl={`${origin}${gatewayWebhookPath(provider, business.id)}`}
                        action={saveGatewayAccountAction.bind(null, business.id, provider)}
                      />
                      {connected ? (
                        <form action={removeGatewayAccountAction.bind(null, business.id, provider)}>
                          <SubmitButton variant="ghost" size="sm" pendingText="Removing...">
                            Disconnect
                          </SubmitButton>
                        </form>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </details>
          ) : null}
        </section>
      ))}
    </main>
  );
}
