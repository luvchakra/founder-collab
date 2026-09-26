import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { getCheckoutSessionStatus } from "@cofounderai/core/billing/overview";
import { isEntitledStatus } from "@cofounderai/core/billing/state";
import { Button } from "@cofounderai/core/ui/button";
import { KeepChecking } from "./keep-checking";

/**
 * BILL-11 -- where the provider sends the customer back (§28, §77, §87). Arriving here
 * proves nothing: the page reads WonderArk's own record of the checkout the signed-in user
 * started (RLS: requesters only) and says "active" only once a verified webhook has made
 * it so. Until then it says so plainly and re-checks.
 */
export default async function CheckoutSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<{ session?: string }>;
}) {
  const { businessSlug } = await params;
  const { session } = await searchParams;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();
  const status = session ? await getCheckoutSessionStatus(session) : null;

  const active = status?.status === "completed" && status.subscriptionStatus !== null && isEntitledStatus(status.subscriptionStatus);
  const failed = status?.status === "failed" || status?.status === "expired" || status?.status === "cancelled";

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center gap-5 py-10 text-center">
      {active ? (
        <>
          <CheckCircle2 className="size-14 text-success" aria-hidden="true" />
          <h1 className="text-2xl font-semibold">Subscription active</h1>
          <p className="text-muted-foreground">
            {status.planName ? `You're on the ${status.planName} plan.` : "Your plan is active."} The modules it includes are ready to use.
          </p>
        </>
      ) : failed ? (
        <>
          <h1 className="text-2xl font-semibold">Checkout didn&apos;t complete</h1>
          <p className="text-muted-foreground">{status?.failureMessage ?? "This checkout expired or was cancelled. You haven't been charged for it."}</p>
          <Button asChild>
            <Link href={`/${businessSlug}/billing/plans`}>Try again</Link>
          </Button>
        </>
      ) : status ? (
        <>
          <Loader2 className="size-12 animate-spin text-primary" aria-hidden="true" />
          <h1 className="text-2xl font-semibold">Payment received</h1>
          <p className="text-muted-foreground">
            We&apos;re confirming your subscription. Your plan will update automatically once confirmation completes — this
            usually takes a few seconds.
          </p>
          <p role="status" className="text-sm">
            Subscription status: <span className="font-medium">Processing</span>
          </p>
          <KeepChecking />
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold">We couldn&apos;t find that checkout</h1>
          <p className="text-muted-foreground">Your billing page shows your current plan and payments.</p>
        </>
      )}
      <Button asChild variant={active ? "default" : "outline"}>
        <Link href={`/${businessSlug}/billing`}>Go to billing</Link>
      </Button>
    </main>
  );
}
