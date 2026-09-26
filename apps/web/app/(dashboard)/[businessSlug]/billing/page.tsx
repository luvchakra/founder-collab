import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CalendarClock } from "lucide-react";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { canManageBilling, getBusinessSubscription, listBusinessPayments } from "@cofounderai/core/billing/overview";
import { resolvePlanEntitlements } from "@cofounderai/core/billing/catalog";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { Button } from "@cofounderai/core/ui/button";
import { getBusiness } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { BillingTabs, formatDay, formatMoney, intervalLabel, ModuleList, PaymentStatusBadge, SubscriptionStatusBadge } from "./billing-ui";
import { ManageBillingButton, ResumeButton } from "./manage-buttons";

/**
 * BILL-19 -- "My subscription" (§30, §73, §77): the plan, its state in plain words, the
 * modules it licenses, and what the customer can do next. Every member can see it;
 * the buttons and the payment history are for account owners and admins.
 */
export default async function BillingPage({ params }: { params: Promise<{ businessSlug: string }> }) {
  const { businessSlug } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const [subscription, manager] = await Promise.all([getBusinessSubscription(businessId), canManageBilling(businessId)]);
  const [modules, payments] = await Promise.all([
    subscription ? resolvePlanEntitlements(subscription.planId) : Promise.resolve([]),
    manager ? listBusinessPayments(businessId, 5) : Promise.resolve([]),
  ]);
  const paid = subscription && subscription.provider !== "internal";
  const lapsed = subscription && ["cancelled", "expired", "incomplete"].includes(subscription.status);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6">
      <PageHeader
        title="Billing"
        description={`Your plan, modules and payments for ${business.name}.`}
        breadcrumbs={[{ label: business.name, href: `/${businessSlug}/business` }, { label: "Billing" }]}
      />
      <BillingTabs businessSlug={businessSlug} active="" />

      {subscription?.status === "past_due" || subscription?.status === "unpaid" ? (
        <div role="alert" className="flex gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-subtle" aria-hidden="true" />
          <div className="flex flex-col gap-2">
            <p className="font-medium">Payment needs attention</p>
            <p className="text-muted-foreground">
              {subscription.status === "past_due"
                ? "We couldn't confirm your latest payment. Your subscription is still active while we try to recover payment."
                : "Your latest payments didn't go through, so your modules are now read-only. Update your payment method to restore full access."}
            </p>
            {manager ? <ManageBillingButton businessSlug={businessSlug} label="Update payment method" /> : null}
          </div>
        </div>
      ) : null}

      <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
        {subscription && !lapsed ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current plan</p>
                <h2 className="mt-1 text-2xl font-semibold">{subscription.planName}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {paid && subscription.amount != null && subscription.currency
                    ? `${formatMoney(subscription.amount, subscription.currency)} / ${intervalLabel(subscription.billingInterval)}`
                    : "Free"}
                </p>
              </div>
              <SubscriptionStatusBadge status={subscription.status} />
            </div>

            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              {paid ? (
                <div>
                  <dt className="text-muted-foreground">{subscription.cancelAtPeriodEnd ? "Access until" : "Next billing date"}</dt>
                  <dd className="font-medium">{formatDay(subscription.currentPeriodEnd)}</dd>
                </div>
              ) : null}
              {subscription.pendingPlanName ? (
                <div>
                  <dt className="text-muted-foreground">Scheduled change</dt>
                  <dd className="font-medium">
                    Moves to {subscription.pendingPlanName} on {formatDay(subscription.pendingChangeAt)}
                  </dd>
                </div>
              ) : null}
            </dl>

            {subscription.cancelAtPeriodEnd ? (
              <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/50 p-3 text-sm">
                <CalendarClock className="size-4 text-muted-foreground" aria-hidden="true" />
                <span className="flex-1">
                  Your plan won&apos;t renew. Full access continues until {formatDay(subscription.currentPeriodEnd)}, then your
                  modules become read-only for 30 days. Your data is never deleted.
                </span>
                {manager ? <ResumeButton businessSlug={businessSlug} /> : null}
              </div>
            ) : null}

            {manager ? (
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <Link href={`/${businessSlug}/billing/plans`}>{paid ? "Change plan" : "Upgrade plan"}</Link>
                </Button>
                {paid ? <ManageBillingButton businessSlug={businessSlug} label="Manage billing" variant="outline" /> : null}
                {paid && !subscription.cancelAtPeriodEnd ? (
                  <Button asChild variant="ghost" className="text-destructive hover:text-destructive">
                    <Link href={`/${businessSlug}/billing/cancel`}>Cancel subscription</Link>
                  </Button>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Ask an owner or admin of this account to change the plan.</p>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current plan</p>
            <h2 className="text-xl font-semibold">{lapsed ? `${subscription!.planName} — ended` : "No plan selected"}</h2>
            <p className="text-sm text-muted-foreground">
              {lapsed
                ? "Your subscription has ended. Modules it included stay readable for 30 days after it ended; choose a plan to restore full access. Your data is never deleted."
                : "Choose a plan to license the modules your business needs."}
            </p>
            {manager ? (
              <Button asChild className="self-start">
                <Link href={`/${businessSlug}/billing/plans`}>Choose a plan</Link>
              </Button>
            ) : null}
          </div>
        )}
      </section>

      {subscription && !lapsed ? (
        <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
          <h2 className="text-base font-semibold">Included modules</h2>
          <ModuleList modules={modules} />
        </section>
      ) : null}

      {manager ? (
        <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Recent payments</h2>
            <Link href={`/${businessSlug}/billing/payments`} className="text-sm font-medium text-primary hover:underline">
              View all
            </Link>
          </div>
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments yet.</p>
          ) : (
            <ul className="divide-y">
              {payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="text-muted-foreground">{formatDay(p.paidAt ?? p.failedAt ?? p.createdAt)}</span>
                  <span className="flex-1 text-right font-medium">{formatMoney(p.amount, p.currency)}</span>
                  <PaymentStatusBadge status={p.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </main>
  );
}
