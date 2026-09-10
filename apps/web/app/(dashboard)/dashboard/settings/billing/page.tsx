import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentAccount } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { CREDIT_PLANS } from "@cofounderai/core/billing/plans";
import { getCreditBalance, listCreditPurchases } from "@cofounderai/core/billing/queries";
import { Badge } from "@cofounderai/core/ui/badge";
import { BuyCredits } from "@/components/settings/buy-credits";
import { PricingTiers } from "@/components/settings/pricing-tiers";

/**
 * co-founder-ai is still free-tier-only by default (blueprint §22 -- no subscription,
 * no payment method requirement to use the product). Free is the only plan actually live;
 * PricingTiers shows Pro/Max/Enterprise for comparison, "Notify me"/"Contact us" rather
 * than a real checkout. "Buy monthly AI credits" is a separate, real purchase flow (see
 * packages/core/src/billing/) available on any plan, for a founder who's hit the free
 * monthly allowance and doesn't want to bring their own provider key.
 */
export default async function BillingSettingsPage() {
  const account = await getCurrentAccount();
  if (!account) redirect("/login");

  const [balance, purchases] = await Promise.all([
    getCreditBalance(account.id),
    listCreditPurchases(account.id),
  ]);
  const razorpayConfigured = Boolean(process.env.RAZORPAY_KEY_ID);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 p-8">
      <div>
        <h1 className="text-xl font-semibold">Billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          co-founder-ai is free today -- Free is the only plan you can actually be on
          right now. Buy extra AI credits any time you&apos;d rather not bring your own
          provider key, or see where Pro and Max are headed below.
        </p>
        <Link
          href="/dashboard/settings/usage"
          className="mt-2 inline-block text-sm font-medium text-primary hover:underline"
        >
          View your current usage →
        </Link>
      </div>

      <PricingTiers />

      <div className="flex max-w-lg flex-col gap-4 rounded-md border p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">AI credits</h2>
          <Badge variant="secondary">{balance.remaining_runs} run{balance.remaining_runs === 1 ? "" : "s"} remaining</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Purchased runs are spent automatically once a workspace goes past its free-tier
          allowance for the month -- no setup required, they just extend the cap.
        </p>

        {razorpayConfigured ? (
          <BuyCredits plans={CREDIT_PLANS} accountName={account.name} />
        ) : (
          <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            Buying credits isn&apos;t available on this deployment yet -- it needs a
            Razorpay account connected (RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET).
          </p>
        )}
      </div>

      {purchases.length > 0 ? (
        <div className="flex max-w-lg flex-col gap-3 rounded-md border p-4">
          <h2 className="font-medium">Purchase history</h2>
          <div className="flex flex-col divide-y">
            {purchases.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
                <div>
                  <p className="font-medium capitalize">{p.plan_key} -- {p.credited_runs} runs</p>
                  <p className="text-xs text-muted-foreground">
                    ₹{(p.amount_inr_paise / 100).toLocaleString("en-IN")} · {new Date(p.created_at).toLocaleDateString("en-IN")}
                  </p>
                </div>
                <Badge variant={p.status === "paid" ? "secondary" : p.status === "failed" ? "destructive" : "outline"}>
                  {p.status}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </main>
  );
}
