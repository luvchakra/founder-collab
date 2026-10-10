import Link from "next/link";
import { listPlatformPlans } from "@cofounderai/core/admin/platform-plans";
import { listPlanModuleEntitlements } from "@cofounderai/core/admin/platform-plan-modules";
import { listPlanPrices } from "@cofounderai/core/admin/platform-billing-ops";
import { isSubscriptionCheckoutLive } from "@cofounderai/core/billing/license-gate";
import { PlatformImpactBanner } from "../../../impact-banner";
import { findPlanGaps } from "./plan-gaps";
import { PlanMatrix, type MatrixPlan } from "./plan-matrix";

function formatAmount(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/**
 * Compare plans -- every live or draft plan side by side, so deciding what Free, Pro and
 * Max include (and what each costs) happens on one screen instead of three entitlements
 * pages. Writes through the same audited paths as those pages: PLATFORM-P0-04.3's
 * `setPlanModuleEnabled()` for each module switch, PLATFORM-P0-04.1's plan dialog (price,
 * with a required reason) and BILL-32's provider prices, which stay on the plan's own
 * entitlements page because they need ids created at Razorpay or Stripe first.
 */
export default async function ComparePlansPage() {
  const plans = (await listPlatformPlans()).filter((plan) => plan.status !== "archived");
  const [entitlements, prices, checkoutLive] = await Promise.all([
    Promise.all(plans.map((plan) => listPlanModuleEntitlements(plan.id))),
    listPlanPrices(),
    isSubscriptionCheckoutLive(),
  ]);

  const modules = (entitlements[0] ?? []).map((m) => ({ key: m.moduleKey, name: m.moduleName }));
  const matrixPlans: MatrixPlan[] = plans.map((plan, i) => ({
    plan,
    priceLabel: `${formatAmount(plan.price, plan.currency)} / ${plan.billingInterval}`,
    enabledModules: entitlements[i].filter((m) => m.enabled).map((m) => m.moduleKey),
    checkoutPrices: prices
      .filter((p) => p.planId === plan.id && p.active)
      .map((p) => `${p.provider === "razorpay" ? "Razorpay" : "Stripe"} ${p.environment} · ${formatAmount(p.amount, p.currency)} / ${p.billingInterval}`),
  }));
  const gaps = findPlanGaps(
    matrixPlans.map((m) => ({ id: m.plan.id, name: m.plan.name, price: m.plan.price, modules: m.enabledModules })),
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <Link href="/platform/plans" className="text-xs text-zinc-400 hover:text-zinc-200">
          ← Subscription Plans
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">Compare plans</h1>
        <p className="text-sm text-zinc-400">
          {checkoutLive
            ? "Checkout is live: a business can only switch on the modules its plan includes. Existing licences are never removed."
            : "Checkout isn't live yet, so these choices take effect once a provider and a checkout price are set. Existing licences are never removed."}
        </p>
      </div>

      <PlatformImpactBanner />

      {gaps.length > 0 ? (
        <ul className="flex flex-col gap-1 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {gaps.map((gap) => (
            <li key={gap.planId}>
              {gap.planName} includes no module that {gap.cheaperPlanName} doesn&apos;t, so upgrading unlocks nothing.
            </li>
          ))}
        </ul>
      ) : null}

      <PlanMatrix plans={matrixPlans} modules={modules} />
    </div>
  );
}
