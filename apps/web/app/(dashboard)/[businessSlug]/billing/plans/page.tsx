import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { canManageBilling, getBusinessSubscription, listPlanOptions } from "@cofounderai/core/billing/overview";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { getBusiness } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { BillingTabs } from "../billing-ui";
import { PlanPicker } from "./plan-picker";

/**
 * BILL-09 -- "Choose your plan" (§31). Built from the canonical platform.plans records and
 * their module entitlements -- never a hard-coded feature list -- and priced from the
 * provider price mappings that can actually bill this business's currency. A plan with no
 * such price shows as unavailable rather than with a made-up amount.
 */
export default async function PlansPage({ params }: { params: Promise<{ businessSlug: string }> }) {
  const { businessSlug } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const [{ plans, currency, checkoutAvailable }, subscription, manager] = await Promise.all([
    listPlanOptions(businessId),
    getBusinessSubscription(businessId),
    canManageBilling(businessId),
  ]);
  const live = subscription && !["cancelled", "expired", "incomplete"].includes(subscription.status) ? subscription : null;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6">
      <PageHeader
        title="Choose your plan"
        description="Each plan licenses a set of modules for this business. You can change or cancel anytime."
        breadcrumbs={[{ label: business.name, href: `/${businessSlug}/business` }, { label: "Billing", href: `/${businessSlug}/billing` }, { label: "Plans" }]}
      />
      <BillingTabs businessSlug={businessSlug} active="/plans" />
      {!checkoutAvailable ? (
        <p role="status" className="rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Online payment isn&apos;t available for {currency} yet. Contact support to change your plan.
        </p>
      ) : null}
      <PlanPicker
        businessSlug={businessSlug}
        plans={plans}
        currentPlanId={live?.planId ?? null}
        currentInterval={live?.billingInterval ?? null}
        hasPaidSubscription={Boolean(live && live.provider !== "internal")}
        canManage={manager}
      />
    </main>
  );
}
