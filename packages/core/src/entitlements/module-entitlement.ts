import { moduleRegistry } from "@cofounderai/module-registry";
import {
  hasModule as hasModuleLicense,
  hasModuleWrite,
  isModuleEnabledPlatformWide,
} from "../licensing/queries";
import type { EntitlementDecision } from "./types";

/**
 * PLATFORM-P0-05.1 (Central Entitlement Service) -- the module-level slice of the "one
 * authoritative service" §9 asks for (`hasModule(business, module)`), returning
 * PLATFORM-P0-05.3's own `{allowed, reason, source, limit, usage, remaining}` shape
 * instead of the plain boolean `licensing/queries.ts`' own `hasModule()`/`hasModuleWrite()`
 * already return.
 *
 * **What this deliberately does and does not compose, per PLATFORM-P0-05.2's own
 * recommended precedence (Platform Global -> Plan -> Business Override -> User
 * Permission), read against what actually exists in this codebase today:**
 *
 * - **License** (this file's own layer): `core.licenses`' per-module active/grace/expired
 *   status (Epic 2, C-3) -- the one entitlement signal that is real, live, and already
 *   authoritative (RLS itself calls `core.has_module()`/`core.has_module_write()`
 *   directly; this function reads the exact same two RPCs through the existing
 *   `licensing/queries.ts` wrappers, per PLATFORM-P0-05.4's "integrate with the existing
 *   licensing model rather than creating a competing licensing system" -- it is not a
 *   second source of truth, only a richer view onto the same one).
 * - **Platform Global** (a platform-wide kill switch per module) -- **composed as of
 *   PLATFORM-P0-07.2**, and checked *first*, before the license layer: `platform.modules
 *   .enabled` (PLATFORM-P0-07.1) is read via `isModuleEnabledPlatformWide()` (a plain,
 *   non-admin-gated read -- `platform.modules`' own RLS already opens SELECT to any
 *   authenticated user), and a disabled module short-circuits straight to
 *   `buildPlatformDisabledDecision()` without ever touching `core.licenses` at all -- a
 *   platform-wide kill switch is a fact about the module, not about this business's own
 *   license, so there is nothing for the license layer to add once it applies. Not
 *   composed into `core.has_module()`/`has_module_write()` themselves (RLS's own
 *   authoritative check) -- doing so would mean changing every module table's own RLS
 *   policy, a genuine architecture change requiring explicit approval, the identical
 *   reasoning the very next paragraph already gives for why `platform.plan_modules` isn't
 *   composed into RLS either. `requireModule()`/the `middleware.ts` route guard (the
 *   other two enforcement layers CLAUDE.md's architecture section names) check the same
 *   flag independently, for the same reason.
 * - **Plan** (whether the business's current *subscription plan* -- `platform.plans` /
 *   `platform.plan_modules`, PLATFORM-P0-04.1/04.3 -- entitles this module at all) --
 *   **still not composed here, now by deliberate choice rather than missing data**. The
 *   business<->plan link this docstring originally called a blocker now exists
 *   (`20260912070000_core_business_settings_plan_fk.sql`, PLATFORM-P0-05.2's own schema
 *   foundation story -- every business has a real `core.business_settings.plan` value,
 *   FK'd to a real `platform.plans.key`), and `hasFeature()`/`getLimit()`
 *   (`feature-entitlement.ts`/`limit-entitlement.ts`, the same story) *do* consult it.
 *   `hasModule()` itself does not, on purpose: `core.has_module()`/`has_module_write()` --
 *   the RLS-authoritative gate every module table's own policy already calls -- have no
 *   equivalent check against `platform.plan_modules`, and PLATFORM-P0-05.4's own
 *   "integrate with the existing licensing model rather than creating a competing
 *   licensing system" is explicit that this function must never produce a *more*
 *   permissive-or-restrictive module answer than RLS itself would. Folding
 *   `platform.plan_modules` into this function's decision without RLS also consulting it
 *   would do exactly that -- a UI-only restriction (or grant) PLATFORM-P0-06.3's own
 *   "enforce limits server-side; UI-only restrictions are not sufficient" already rules
 *   out for the sibling Usage & Limits section, and the same principle applies here.
 *   Wiring `platform.plan_modules` into module-level access for real would mean changing
 *   `core.has_module()`/`has_module_write()` and every module table's own RLS policy --
 *   a genuine architecture change this run's task assignment requires explicit approval
 *   for, not something to fold into this story unreviewed. `platform.plan_modules` stays
 *   catalog/merchandising data (what a plan is sold as including) until that future story
 *   makes it real.
 * - **Business Override** -- **not composed**: PLATFORM-P1-02.1 ("Business Override") is
 *   explicit, named future P1 scope (`docs/plan/09-...md` §24), not this section's to
 *   build ahead of its own turn.
 * - **User Permission** -- **not composed here, and does not need to be**: this layer is
 *   already real and already enforced independently, via `core.has_permission()` /
 *   `requirePermission()` (`packages/core/src/rbac/require-permission.ts`) at each
 *   individual action's own call site -- a business-level "is this module entitled at
 *   all" decision (what this function answers) is a different question from "can this
 *   particular signed-in user perform this particular action," which every mutating
 *   action already answers for itself. Folding per-user RBAC into a business-level
 *   entitlement check would conflate two independent axes this codebase already keeps
 *   separate, not close a real gap.
 *
 * `source` is `"platform_global"` when a superadmin has disabled the module platform-wide,
 * `"license"` otherwise -- the other three layers still have no real data source to read
 * yet, story by story, the same way `platform.plan_modules`' own `enabled` column
 * (PLATFORM-P0-04.3) still exists today with nothing yet reading it for a real
 * authorization decision.
 */
export async function hasModule(businessId: string, moduleKey: string): Promise<EntitlementDecision> {
  const platformEnabled = await isModuleEnabledPlatformWide(moduleKey);
  if (!platformEnabled) {
    return buildPlatformDisabledDecision(moduleKey);
  }
  const [readAllowed, writeAllowed] = await Promise.all([
    hasModuleLicense(businessId, moduleKey),
    hasModuleWrite(businessId, moduleKey),
  ]);
  return buildModuleEntitlementDecision(moduleKey, readAllowed, writeAllowed);
}

/** PLATFORM-P0-07.2 -- the pure decision shape for a platform-wide-disabled module,
 * factored out the same way `buildModuleEntitlementDecision()` below is, so it is
 * unit-testable without a database. Always `allowed: false`: a platform-wide kill switch
 * has no degraded "read-only" state the way a license's grace period does -- §11 names no
 * such nuance, and PLATFORM-P0-07.3 (Maintenance Mode) is the section that will introduce
 * a `read_only` state, not this one. */
export function buildPlatformDisabledDecision(moduleKey: string): EntitlementDecision {
  const moduleName = moduleRegistry.find((m) => m.key === moduleKey)?.name ?? moduleKey;
  return {
    allowed: false,
    reason: `${moduleName} has been temporarily disabled platform-wide by WonderArc.`,
    source: "platform_global",
    limit: null,
    usage: null,
    remaining: null,
  };
}

/**
 * Pure decision-composition logic, factored out of `hasModule()` above so it can be unit
 * tested directly without a database -- the same "pure helper beside the IO-touching
 * function" split `platform-branding.ts`'s own `toBranding()`/`toInputFromBranding()`
 * already established in this backlog. `allowed` mirrors `core.has_module_write()`'s own
 * stricter "fully licensed, not degraded" meaning (the same gate `requireModule()` already
 * enforces for writes) rather than `core.has_module()`'s broader read-during-grace
 * meaning, since a caller consulting a single yes/no entitlement decision is almost always
 * asking "can this be used," not "is this merely still readable while winding down" --
 * that read-only-grace nuance is preserved as its own distinct `reason` under
 * `allowed: false`, not collapsed into an unqualified `true`.
 */
export function buildModuleEntitlementDecision(
  moduleKey: string,
  readAllowed: boolean,
  writeAllowed: boolean,
): EntitlementDecision {
  const moduleName = moduleRegistry.find((m) => m.key === moduleKey)?.name ?? moduleKey;
  const base = { source: "license" as const, limit: null, usage: null, remaining: null };

  if (writeAllowed) {
    return { ...base, allowed: true, reason: `${moduleName} is licensed and active.` };
  }
  if (readAllowed) {
    return {
      ...base,
      allowed: false,
      reason: `${moduleName}'s license is in its read-only grace period.`,
    };
  }
  return { ...base, allowed: false, reason: `${moduleName} is not licensed for this business.` };
}
