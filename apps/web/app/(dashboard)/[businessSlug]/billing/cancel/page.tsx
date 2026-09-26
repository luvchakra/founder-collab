import { notFound, redirect } from "next/navigation";
import { CheckCircle2, Info } from "lucide-react";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { canManageBilling, getBusinessSubscription } from "@cofounderai/core/billing/overview";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { formatDay } from "../billing-ui";
import { CancelForm } from "./cancel-form";

/**
 * BILL-24 -- cancellation (§8): renewal stops, access continues to the end of the paid
 * period, then the licences take the existing 30-day read-only grace (ADR-9). Immediate
 * cancellation is not offered here -- it is a Platform Admin action.
 */
export default async function CancelPage({ params }: { params: Promise<{ businessSlug: string }> }) {
  const { businessSlug } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();
  if (!(await canManageBilling(businessId))) redirect(`/${businessSlug}/billing`);
  const subscription = await getBusinessSubscription(businessId);
  if (!subscription || subscription.provider === "internal" || subscription.cancelAtPeriodEnd || ["cancelled", "expired", "incomplete"].includes(subscription.status)) {
    redirect(`/${businessSlug}/billing`);
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6">
      <PageHeader title="Cancel subscription" breadcrumbs={[{ label: "Billing", href: `/${businessSlug}/billing` }, { label: "Cancel" }]} />
      <section className="flex flex-col gap-5 rounded-xl border bg-card p-5">
        <p className="flex gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive-subtle">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Your {subscription.planName} plan will remain active until {formatDay(subscription.currentPeriodEnd)}.
        </p>
        <div>
          <p className="mb-2 text-sm font-medium">Before you cancel</p>
          <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
            {[
              "You keep full access until the end of the period you've paid for.",
              "After that, your modules are read-only for 30 days.",
              "Your data is never deleted -- subscribe again anytime to restore everything.",
              "No further charges after the current period.",
            ].map((line) => (
              <li key={line} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                {line.replace("--", "—")}
              </li>
            ))}
          </ul>
        </div>
        <CancelForm businessSlug={businessSlug} />
      </section>
    </main>
  );
}
