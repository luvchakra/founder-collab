import { notFound } from "next/navigation";
import Link from "next/link";
import { getPlatformPlan } from "@cofounderai/core/admin/platform-plans";
import { listPlanModuleEntitlements } from "@cofounderai/core/admin/platform-plan-modules";
import { ModuleEntitlementsSection } from "./module-entitlements-section";

/**
 * PLATFORM-P0-04.2 ("Plan Entitlements", docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md
 * §8) -- the composite per-plan entitlements screen. Per PLATFORM-P0-04.1's own migration
 * docstring, this is explicitly "the composite view of [module entitlements, feature-level
 * entitlements, quantity limits] once they exist -- not its own table", so this page grows
 * one section per sibling story as each table lands in this same run: module entitlements
 * (PLATFORM-P0-04.3, built here first) now, feature-level entitlements
 * (PLATFORM-P0-04.4) and quantity limits (PLATFORM-P0-04.5/04.6) as their own follow-up
 * commits add their own sections below -- not built ahead of their own turn.
 */
export default async function PlanEntitlementsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const plan = await getPlatformPlan(id);
  if (!plan) notFound();

  const moduleEntitlements = await listPlanModuleEntitlements(id);

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

      <ModuleEntitlementsSection planId={id} entitlements={moduleEntitlements} />
    </div>
  );
}
