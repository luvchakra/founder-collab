import { moduleRegistry } from "@cofounderai/module-registry";
import { hasModule as hasModuleLicense, hasModuleWrite } from "../licensing/queries";
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
 * - **Platform Global** (a platform-wide kill switch per module) -- **not composed**:
 *   PLATFORM-P0-07.2 ("Platform-Wide Module Kill Switch") is listed "Not started" in this
 *   backlog's own progress table; there is no `platform.*` row this layer could read yet.
 * - **Plan** (whether the business's current *subscription plan* -- `platform.plans` /
 *   `platform.plan_modules`, PLATFORM-P0-04.1/04.3 -- entitles this module at all) --
 *   **not composed**: nothing in this codebase assigns a business to a
 *   `platform.plans` row. `core.business_settings.plan` is a pre-existing, free-text
 *   column (default `'starter'`, no FK, no matching key in the seeded Free/Pro/Max
 *   catalog) that PLATFORM-P0-04.1's own audit entry already found to be disconnected
 *   from `platform.plans` -- confirmed again here rather than assumed
 *   (`information_schema.columns` still shows no constraint tying it to anything). Which
 *   table/column should carry that link, whether existing businesses need a default
 *   backfilled, and what "no plan assigned" should mean for enforcement are none of them
 *   answered anywhere in `docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md` -- PLATFORM-P1-04.1
 *   ("Plan Change Rules") is the only place upgrade/downgrade/plan-assignment mechanics are
 *   named at all, and it is explicit P1 scope. Inventing that link here would be exactly
 *   the kind of unreviewed architecture decision this run's own task assignment says to
 *   stop and report on rather than guess into `main` -- flagged in this run's audit-log
 *   entry for PLATFORM-P0-05.1, not silently decided in code.
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
 * `source` is therefore always `"license"` today -- accurate, not a placeholder -- and
 * will start reflecting the other layers only once each one has a real data source to
 * read, story by story, the same way `platform.plan_modules`' own `enabled` column
 * (PLATFORM-P0-04.3) exists today with nothing yet reading it for a real authorization
 * decision.
 */
export async function hasModule(businessId: string, moduleKey: string): Promise<EntitlementDecision> {
  const [readAllowed, writeAllowed] = await Promise.all([
    hasModuleLicense(businessId, moduleKey),
    hasModuleWrite(businessId, moduleKey),
  ]);
  return buildModuleEntitlementDecision(moduleKey, readAllowed, writeAllowed);
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
