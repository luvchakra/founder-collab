import type { ReactNode } from "react";
import Link from "next/link";
import { getSubscriptionLifecycleSettings } from "@cofounderai/core/admin/platform-billing-lifecycle";
import { listPlatformPlans } from "@cofounderai/core/admin/platform-plans";
import { listModuleRegistry } from "@cofounderai/core/admin/platform-modules";
import { PlatformImpactBanner } from "../../../impact-banner";
import { Panel } from "../billing-ui";
import { BillingConfigDialog } from "./billing-config-dialog";
import { LifecycleDialog } from "./lifecycle-dialog";

/**
 * PLATFORM-P1-04.2/04.3/04.4 (Subscription Lifecycle) and PLATFORM-P1-05.1/05.3/05.4
 * (Platform Billing Configuration). Plan-change rules (04.1) and providers/environments
 * (05.2) stay on the Providers tab where subscription billing built them.
 */
export default async function BillingLifecyclePage() {
  const [settings, plans, modules] = await Promise.all([getSubscriptionLifecycleSettings(), listPlatformPlans(), listModuleRegistry()]);
  const planName = new Map(plans.map((p) => [p.id, p.name]));
  const trialPlans = settings.trialPlanIds.map((id) => planName.get(id) ?? "Unknown plan");
  const taxText = {
    provider: "Calculated by the payment provider on its payment page",
    inclusive: `${settings.taxLabel} ${settings.taxRatePercent}% included in prices`,
    exclusive: `${settings.taxLabel} ${settings.taxRatePercent}% added to prices`,
    none: "No tax charged",
  }[settings.taxMode];

  return (
    <div className="flex flex-col gap-6">
      <PlatformImpactBanner description="These settings apply to every business's subscription from its next lifecycle event." />

      <Panel
        title="Trials and grace"
        description="Cancel → grace → locked. Data is never deleted because a subscription ends."
        action={
          <LifecycleDialog
            settings={settings}
            plans={plans.filter((p) => p.status === "active" && p.price > 0).map((p) => ({ id: p.id, name: p.name }))}
            modules={modules.map((m) => ({ key: m.moduleKey, name: m.moduleName }))}
          />
        }
      >
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <Item label="Free trial">{settings.trialDays > 0 ? `${settings.trialDays} days, once per business` : "Off"}</Item>
          <Item label="Trial plans">{trialPlans.length > 0 ? trialPlans.join(", ") : "None"}</Item>
          <Item label="Trial entitlements">{settings.trialModuleKeys ? settings.trialModuleKeys.join(", ") || "No modules" : "The plan's full modules"}</Item>
          <Item label="Payment grace">{settings.paymentGraceDays} days of full access after a failed payment</Item>
          <Item label="Read-only grace">{settings.featureGraceDays} days after a subscription ends</Item>
          <Item label="Data after lock">
            {settings.lockedDataRetentionDays === null ? "Kept indefinitely" : `Kept at least ${settings.lockedDataRetentionDays} days`}
          </Item>
        </dl>
      </Panel>

      <Panel title="Currency and subscription tax" description="WonderArk's own billing -- not a business's tax compliance." action={<BillingConfigDialog settings={settings} />}>
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <Item label="Supported currencies">{settings.supportedCurrencies.join(", ")}</Item>
          <Item label="Subscription tax">{taxText}</Item>
          <Item label="WonderArk tax ID">{settings.sellerTaxId ?? "Not set"}</Item>
          <Item label="Tax registration">{settings.taxCountry ?? "Not set"}</Item>
        </dl>
      </Panel>

      <Panel title="Price versioning" description="Enforced by the database.">
        <p className="text-sm text-zinc-400">
          A recorded price can&apos;t be edited: a new price is a new row and the old one is deactivated, and every subscription
          keeps the exact price row it was sold on. Manage prices on each plan&apos;s page under{" "}
          <Link href="/platform/plans" className="underline hover:text-zinc-100">
            Plans
          </Link>
          ; providers and test/live environments are on{" "}
          <Link href="/platform/billing/providers" className="underline hover:text-zinc-100">
            Providers
          </Link>
          .
        </p>
      </Panel>
    </div>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs tracking-wide text-zinc-500 uppercase">{label}</dt>
      <dd className="text-zinc-100">{children}</dd>
    </div>
  );
}
