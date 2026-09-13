import { notFound } from "next/navigation";
import Link from "next/link";
import { getPlatformPlan } from "@cofounderai/core/admin/platform-plans";
import { listPlanModuleEntitlements } from "@cofounderai/core/admin/platform-plan-modules";
import { listPlanLimits } from "@cofounderai/core/admin/platform-plan-limits";
import { listPlanFeatureEntitlements } from "@cofounderai/core/admin/platform-plan-features";
import { PlatformImpactBanner } from "../../../../impact-banner";
import { ModuleEntitlementsSection } from "./module-entitlements-section";
import { QuantityLimitsSection } from "./quantity-limits-section";
import { FeatureEntitlementsSection } from "./feature-entitlements-section";

/**
 * PLATFORM-P0-04.2 ("Plan Entitlements", docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md
 * §8) -- the composite per-plan entitlements screen. Per PLATFORM-P0-04.1's own migration
 * docstring, this is explicitly "the composite view of [module entitlements, feature-level
 * entitlements, quantity limits] once they exist -- not its own table". All three
 * prerequisite tables now exist (PLATFORM-P0-04.3, 04.4, 04.5/04.6, each built as its own
 * commit before this page combined them), so this page itself now stands as
 * PLATFORM-P0-04.2's own concrete deliverable -- three sections, one per underlying table,
 * not a fourth table of its own.
 */
export default async function PlanEntitlementsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const plan = await getPlatformPlan(id);
  if (!plan) notFound();

  const [moduleEntitlements, limits, featureEntitlements] = await Promise.all([
    listPlanModuleEntitlements(id),
    listPlanLimits(id),
    listPlanFeatureEntitlements(id),
  ]);
  const modules = moduleEntitlements.map((m) => ({ key: m.moduleKey, name: m.moduleName }));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <Link href="/platform/plans" className="text-xs text-zinc-400 hover:text-zinc-200">
          ← Subscription Plans
        </Link>
        <h1 className="mt-1 text-xl font-semibold">{plan.name} — Entitlements</h1>
        <p className="text-sm text-zinc-400">
          What businesses subscribed to the {plan.name} plan can access. Changes apply the moment they are saved.
        </p>
      </div>

      <PlatformImpactBanner />

      <ModuleEntitlementsSection planId={id} entitlements={moduleEntitlements} />
      <FeatureEntitlementsSection planId={id} entitlements={featureEntitlements} modules={modules} />
      <QuantityLimitsSection planId={id} limits={limits} />
    </div>
  );
}
