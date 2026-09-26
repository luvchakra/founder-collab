import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { canManageBilling, getBusinessSubscription, listPlanOptions } from "@cofounderai/core/billing/overview";
import { ManageBillingError, previewPlanChange } from "@cofounderai/core/billing/manage";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { Button } from "@cofounderai/core/ui/button";
import { formatDay, formatMoney, ModuleList } from "../billing-ui";
import { ConfirmChangeButton } from "./confirm-change";

/**
 * BILL-22 / BILL-23 -- upgrade and downgrade (§9, §10, §54). The timing and proration come
 * from Platform Admin's billing settings, not from this page; the page only explains them.
 * Modules a downgrade removes stay until the change takes effect, then follow the usual
 * 30-day read-only grace.
 */
export default async function ChangePlanPage({
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
  if (!(await canManageBilling(businessId)) || !planId) redirect(`/${businessSlug}/billing`);

  const [{ plans }, subscription] = await Promise.all([listPlanOptions(businessId), getBusinessSubscription(businessId)]);
  const target = plans.find((p) => p.id === planId);
  const current = plans.find((p) => p.id === subscription?.planId);
  if (!target || !subscription) redirect(`/${businessSlug}/billing/plans`);

  let preview: Awaited<ReturnType<typeof previewPlanChange>> | null = null;
  let problem: string | null = null;
  try {
    preview = await previewPlanChange(businessId, target.id, interval);
  } catch (error) {
    if (!(error instanceof ManageBillingError)) throw error;
    problem = error.message;
  }
  const removed = current ? current.modules.filter((m) => !target.modules.includes(m)) : [];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6">
      <PageHeader
        title={preview?.direction === "downgrade" ? "Downgrade your plan" : "Upgrade your plan"}
        breadcrumbs={[{ label: "Billing", href: `/${businessSlug}/billing` }, { label: "Plans", href: `/${businessSlug}/billing/plans` }, { label: "Change plan" }]}
      />
      <section className="flex flex-col gap-5 rounded-xl border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Current</p>
            <p className="mt-1 font-semibold">{subscription.planName}</p>
            {subscription.amount != null && subscription.currency ? (
              <p className="text-sm text-muted-foreground">
                {formatMoney(subscription.amount, subscription.currency)} / {subscription.billingInterval ?? "month"}
              </p>
            ) : null}
          </div>
          <div className="rounded-lg border border-primary p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">New</p>
            <p className="mt-1 font-semibold">{target.name}</p>
            {preview ? (
              <p className="text-sm text-muted-foreground">
                {formatMoney(preview.targetPrice.amount, preview.targetPrice.currency)} / {interval}
              </p>
            ) : null}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">{target.name} includes</p>
          <ModuleList modules={target.modules} />
        </div>

        {problem ? (
          <p role="alert" className="rounded-lg bg-muted/50 p-3 text-sm">
            {problem}
          </p>
        ) : preview ? (
          <div className="rounded-lg bg-muted/50 p-3 text-sm">
            {preview.timing === "immediate" ? (
              <p>
                The change applies now.{" "}
                {preview.prorate
                  ? "You'll be charged or credited the prorated difference for the rest of this billing period."
                  : "The new price applies from your next billing date."}
              </p>
            ) : (
              <p>
                The change takes effect on {formatDay(preview.effectiveAt)}, your next billing date. You keep {subscription.planName} until then.
              </p>
            )}
            {removed.length > 0 ? (
              <p className="mt-2 text-muted-foreground">
                Modules not in {target.name} become read-only for 30 days once the change takes effect. Your data is kept.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/${businessSlug}/billing/plans`}>Back</Link>
          </Button>
          {preview ? (
            <ConfirmChangeButton
              businessSlug={businessSlug}
              planId={target.id}
              interval={interval}
              label={preview.timing === "immediate" ? `Switch to ${target.name}` : `Schedule change to ${target.name}`}
            />
          ) : null}
        </div>
      </section>
    </main>
  );
}
