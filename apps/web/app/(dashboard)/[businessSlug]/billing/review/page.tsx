import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { canManageBilling, getBusinessSubscription, listPlanOptions } from "@cofounderai/core/billing/overview";
import { describeSubscriptionTax, getTrialOffer, loadLifecycleSettings } from "@cofounderai/core/billing/lifecycle";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { Button } from "@cofounderai/core/ui/button";
import { getBusiness } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { formatMoney, ModuleList } from "../billing-ui";
import { CheckoutButton } from "./checkout-button";

/**
 * BILL-10 -- "Review your plan" (§32). Everything shown is server-derived from the plan
 * and its provider price; the button sends only the plan id, interval and an idempotency
 * key (BILL-08). Tax is not invented here (§56): whatever the payment page adds is what
 * is charged, and it is shown on the payment page and the receipt -- unless the platform
 * has configured a fixed subscription tax (PLATFORM-P1-05.3), which is then shown here.
 * An eligible plan starts with the configured free trial (PLATFORM-P1-04.2).
 */
export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<{ plan?: string; interval?: string }>;
}) {
  const { businessSlug } = await params;
  const { plan: planId, interval: rawInterval } = await searchParams;
  const interval = rawInterval === "year" ? "year" : "month";
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();
  const business = await getBusiness(businessId);
  if (!business) notFound();
  if (!(await canManageBilling(businessId))) redirect(`/${businessSlug}/billing`);

  const [{ plans }, subscription] = await Promise.all([listPlanOptions(businessId), getBusinessSubscription(businessId)]);
  const plan = plans.find((p) => p.id === planId);
  if (!plan) redirect(`/${businessSlug}/billing/plans`);
  const live = subscription && !["cancelled", "expired", "incomplete"].includes(subscription.status);
  if (live && subscription.provider !== "internal") redirect(`/${businessSlug}/billing/change?plan=${plan.id}&interval=${interval}`);

  const free = plan.price === 0;
  const price = plan.prices[interval];
  const onTrialOfThisPlan = subscription?.status === "trialing" && subscription.provider === "internal" && subscription.planId === plan.id;
  const [lifecycle, trial] = await Promise.all([loadLifecycleSettings(), free || onTrialOfThisPlan ? null : getTrialOffer(businessId, plan.id)]);
  const tax = price ? describeSubscriptionTax(lifecycle, price.amount) : null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6">
      <PageHeader
        title="Review your plan"
        description="Check what you're subscribing to before you pay."
        breadcrumbs={[{ label: "Billing", href: `/${businessSlug}/billing` }, { label: "Plans", href: `/${businessSlug}/billing/plans` }, { label: "Review" }]}
      />
      <section className="flex flex-col gap-5 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-semibold">{plan.name}</h2>
          <p className="text-lg font-semibold">
            {free ? "Free" : price ? `${formatMoney(price.amount, price.currency)} / ${interval}` : "Not available"}
          </p>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">Includes</p>
          <ModuleList modules={plan.modules} />
        </div>
        {!free && price ? (
          <dl className="grid gap-2 border-t pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Billing cycle</dt>
              <dd>{interval === "year" ? "Yearly" : "Monthly"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Plan price</dt>
              <dd>{formatMoney(price.amount, price.currency)}</dd>
            </div>
            {tax ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{tax.label}</dt>
                <dd className="text-right text-muted-foreground">
                  {tax.taxAmount !== null && tax.taxAmount > 0 ? `${formatMoney(tax.taxAmount, price.currency)} · ` : ""}
                  {tax.detail}
                </dd>
              </div>
            ) : null}
            {tax?.total != null && tax.total !== price.amount ? (
              <div className="flex justify-between font-medium">
                <dt>Total</dt>
                <dd>{formatMoney(tax.total, price.currency)}</dd>
              </div>
            ) : null}
            <p className="pt-2 text-muted-foreground">
              {trial
                ? `Starts with a ${trial.days}-day free trial -- no payment now. Choose to pay any time before it ends to keep your modules.`
                : `Billing starts today and renews every ${interval}. Cancel anytime; access continues until the end of the period you paid for.`}
            </p>
          </dl>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/${businessSlug}/billing/plans`}>Back</Link>
          </Button>
          {free || price ? <CheckoutButton businessSlug={businessSlug} planId={plan.id} interval={interval} free={free} trialDays={trial?.days ?? null} /> : null}
        </div>
      </section>
    </main>
  );
}
