import type { ReactNode } from "react";
import Link from "next/link";
import { getBillingProviderStatus, type BillingProviderStatus } from "@cofounderai/core/admin/platform-billing";
import { getPlatformBillingOverview, listPlatformBillingEvents } from "@cofounderai/core/admin/platform-billing-ops";
import { Badge } from "@cofounderai/core/ui/badge";
import { EnvironmentBadge, KpiCard, Panel, formatMoney, formatWhen } from "./billing-ui";

/**
 * BILL-26 -- billing overview (§36, §44, §70). Every number comes from WonderArk's own
 * records via getPlatformBillingOverview(); money is shown per currency, never summed
 * across currencies. Webhook health (§44) is one card per provider, built from the
 * provider status rows plus the count of stored events still in `failed`.
 */
export default async function PlatformBillingOverviewPage() {
  const [overview, providers, failedEvents] = await Promise.all([
    getPlatformBillingOverview(),
    getBillingProviderStatus(),
    listPlatformBillingEvents({ status: "failed" }),
  ]);

  const failedByProvider = new Map<string, number>();
  for (const e of failedEvents) failedByProvider.set(e.provider, (failedByProvider.get(e.provider) ?? 0) + 1);
  const failedCapped = failedEvents.length >= 200;

  const moneyList = (list: { currency: string; amount: number }[]) =>
    list.length === 0 ? "—" : (
      <span className="flex flex-col">
        {list.map((m) => (
          <span key={m.currency}>{formatMoney(m.amount, m.currency)}</span>
        ))}
      </span>
    );

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-zinc-400 uppercase">Subscriptions</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <KpiCard label="Active" value={overview.activeSubscriptions} detail="Paid, active or trialing" />
          <KpiCard label="Past due" value={overview.pastDue} tone={overview.pastDue > 0 ? "warning" : undefined} detail="Past due or unpaid" />
          <KpiCard label="Cancel scheduled" value={overview.cancelScheduled} detail="Ends at period end" />
          <KpiCard label="MRR" value={moneyList(overview.mrr)} detail="Per currency; yearly plans ÷ 12" />
          <KpiCard label="Revenue (30d)" value={moneyList(overview.revenue30d)} detail="Captured, net of refunds" />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-zinc-400 uppercase">Activity</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Payments (30d)"
            value={overview.payments30d.succeeded}
            detail={`${overview.payments30d.succeeded} succeeded · ${overview.payments30d.failed} failed · ${overview.payments30d.refunded} refunded`}
          />
          <KpiCard
            label="Checkouts (30d)"
            value={overview.checkouts30d.started}
            detail={`${overview.checkouts30d.completed} completed · ${overview.checkouts30d.failed} failed · ${overview.checkouts30d.expired} expired`}
          />
          <KpiCard
            label="Webhooks (24h)"
            value={overview.webhooks24h.received}
            tone={overview.webhooks24h.failed > 0 ? "warning" : undefined}
            detail={`${overview.webhooks24h.received} received · ${overview.webhooks24h.failed} failed · ${overview.webhooks24h.unhandled} unhandled`}
          />
          <KpiCard
            label="Failed events"
            value={overview.failedEvents}
            tone={overview.failedEvents > 0 ? "danger" : undefined}
            detail={
              overview.failedEvents > 0 ? (
                <Link href="/platform/billing/events?status=failed" className="underline hover:text-zinc-100">
                  Review and retry
                </Link>
              ) : (
                "Nothing waiting for a retry"
              )
            }
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-zinc-400 uppercase">Webhook health</h2>
        {providers.length === 0 ? (
          <p className="text-sm text-zinc-400">No billing providers are set up yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {providers.map((p) => (
              <WebhookHealthCard key={p.provider} provider={p} failed={failedByProvider.get(p.provider) ?? 0} capped={failedCapped} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function WebhookHealthCard({ provider, failed, capped }: { provider: BillingProviderStatus; failed: number; capped: boolean }) {
  const name = provider.provider === "razorpay" ? "Razorpay" : "Stripe";
  const lastFailureIsLatest =
    provider.lastWebhookFailureAt != null && (provider.lastWebhookAt == null || provider.lastWebhookFailureAt > provider.lastWebhookAt);
  return (
    <Panel
      title={name}
      action={
        <div className="flex items-center gap-2">
          <EnvironmentBadge environment={provider.environment} />
          <Badge variant={provider.enabled ? "success" : "secondary"}>{provider.enabled ? "Enabled" : "Disabled"}</Badge>
        </div>
      }
    >
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
        <Fact label="Secret key">
          <Configured value={provider.secretKeyConfigured} />
        </Fact>
        <Fact label="Webhook secret">
          <Configured value={provider.webhookSecretConfigured} />
        </Fact>
        <Fact label="Last webhook">{formatWhen(provider.lastWebhookAt)}</Fact>
        <Fact label="Last failure">
          <span className={lastFailureIsLatest ? "text-red-400" : undefined}>{formatWhen(provider.lastWebhookFailureAt)}</span>
        </Fact>
        <Fact label="Failed events">
          {failed > 0 ? (
            <Link href={`/platform/billing/events?status=failed&provider=${provider.provider}`} className="text-red-400 underline">
              {failed}
              {capped ? "+" : ""} failed
            </Link>
          ) : (
            <span className="text-zinc-300">0 failed</span>
          )}
        </Fact>
      </dl>
      {!provider.webhookSecretConfigured && provider.enabled ? (
        <p className="text-xs text-amber-300">
          No webhook secret is stored, so this provider&apos;s webhooks can&apos;t be verified.{" "}
          <Link href="/platform/billing/providers" className="underline">
            Set it on Providers
          </Link>
          .
        </p>
      ) : null}
    </Panel>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="text-zinc-200">{children}</dd>
    </div>
  );
}

function Configured({ value }: { value: boolean }) {
  return <Badge variant={value ? "success" : "secondary"}>{value ? "Configured" : "Not configured"}</Badge>;
}
