// EXP-ADMIN-04 -- Plans and entitlements export.
import { listPlatformPlans, type PlatformPlan } from "@cofounderai/core/admin/platform-plans";
import { listPlanModuleEntitlements } from "@cofounderai/core/admin/platform-plan-modules";
import { listPlanFeatureEntitlements } from "@cofounderai/core/admin/platform-plan-features";
import { listPlanLimits, RESOURCE_LABELS, type PlanResourceLimit } from "@cofounderai/core/admin/platform-plan-limits";
import type { PlatformExportAdapter } from "@cofounderai/core/exports/platform";

type ModuleRow = { plan: string; module: string; enabled: boolean };
type FeatureRow = { plan: string; module: string; feature: string; enabled: boolean };
type LimitRow = { plan: string; resource: string; state: string; limit: number | null; type: string };

const STATUS_LABEL: Record<string, string> = { draft: "Draft", active: "Active", deprecated: "Deprecated", archived: "Archived" };
const LIMIT_STATE_LABEL: Record<string, string> = { limited: "Limited", unlimited: "Unlimited", disabled: "Disabled" };

/** The plan catalogue with what each plan entitles: modules, features and resource
 * limits, one sheet each. No payment-provider configuration is read or written. */
export const platformPlansExport: PlatformExportAdapter<Record<string, never>> = {
  id: "platform.plans",
  parseFilters: () => ({}),
  async load() {
    const plans = await listPlatformPlans();
    const perPlan = await Promise.all(
      plans.map(async (plan) => {
        const [modules, features, limits] = await Promise.all([
          listPlanModuleEntitlements(plan.id),
          listPlanFeatureEntitlements(plan.id),
          listPlanLimits(plan.id),
        ]);
        return { plan, modules, features, limits };
      }),
    );
    const moduleRows: ModuleRow[] = perPlan.flatMap(({ plan, modules }) =>
      modules.map((m) => ({ plan: plan.name, module: m.moduleName, enabled: m.enabled })),
    );
    const featureRows: FeatureRow[] = perPlan.flatMap(({ plan, features }) =>
      features.map((f) => ({ plan: plan.name, module: f.moduleKey, feature: f.featureName, enabled: f.enabled })),
    );
    const limitRows: LimitRow[] = perPlan.flatMap(({ plan, limits }) =>
      limits.map((l: PlanResourceLimit) => ({
        plan: plan.name,
        resource: RESOURCE_LABELS[l.resourceKey] ?? l.resourceKey,
        state: l.configured ? (LIMIT_STATE_LABEL[l.state] ?? l.state) : "Not configured",
        limit: l.configured ? l.limitValue : null,
        type: l.configured && l.limitType ? (l.limitType === "hard" ? "Hard" : "Soft") : "",
      })),
    );
    return {
      module: "platform",
      resource: "plans",
      title: "Plans and entitlements",
      sheets: [
        {
          sheetName: "Plans",
          columns: [
            { key: "name", header: "Plan", getValue: (p: PlatformPlan) => p.name },
            { key: "key", header: "Key", getValue: (p: PlatformPlan) => p.key },
            { key: "status", header: "Status", getValue: (p: PlatformPlan) => STATUS_LABEL[p.status] ?? p.status },
            { key: "active", header: "Active", type: "boolean", getValue: (p: PlatformPlan) => p.status === "active" },
            { key: "visible", header: "Visible on marketing site", type: "boolean", getValue: (p: PlatformPlan) => p.marketingVisible },
            { key: "price", header: "Price", type: "currency", getValue: (p: PlatformPlan) => p.price },
            { key: "currency", header: "Currency", getValue: (p: PlatformPlan) => p.currency.toUpperCase() },
            { key: "interval", header: "Billing interval", getValue: (p: PlatformPlan) => (p.billingInterval === "year" ? "Yearly" : "Monthly") },
            { key: "order", header: "Display order", type: "integer", getValue: (p: PlatformPlan) => p.displayOrder },
            { key: "description", header: "Description", getValue: (p: PlatformPlan) => p.description },
            { key: "updatedAt", header: "Last updated", type: "datetime", getValue: (p: PlatformPlan) => p.updatedAt },
          ],
          rows: plans,
        },
        {
          sheetName: "Modules",
          columns: [
            { key: "plan", header: "Plan", getValue: (r: ModuleRow) => r.plan },
            { key: "module", header: "Module", getValue: (r: ModuleRow) => r.module },
            { key: "enabled", header: "Entitled", type: "boolean", getValue: (r: ModuleRow) => r.enabled },
          ],
          rows: moduleRows,
        },
        {
          sheetName: "Features",
          columns: [
            { key: "plan", header: "Plan", getValue: (r: FeatureRow) => r.plan },
            { key: "module", header: "Module", getValue: (r: FeatureRow) => r.module },
            { key: "feature", header: "Feature", getValue: (r: FeatureRow) => r.feature },
            { key: "enabled", header: "Entitled", type: "boolean", getValue: (r: FeatureRow) => r.enabled },
          ],
          rows: featureRows,
        },
        {
          sheetName: "Limits",
          columns: [
            { key: "plan", header: "Plan", getValue: (r: LimitRow) => r.plan },
            { key: "resource", header: "Resource", getValue: (r: LimitRow) => r.resource },
            { key: "state", header: "State", getValue: (r: LimitRow) => r.state },
            { key: "limit", header: "Limit", type: "integer", getValue: (r: LimitRow) => r.limit },
            { key: "type", header: "Limit type", getValue: (r: LimitRow) => r.type },
          ],
          rows: limitRows,
        },
      ],
    };
  },
};
