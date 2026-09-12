import { moduleRegistry } from "@cofounderai/module-registry";
import {
  defaultPlatformBlockedMessage,
  defaultPlatformReadOnlyMessage,
  getPlatformModuleStatus,
  hasModule as hasModuleLicense,
  hasModuleWrite,
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
 * `source` is `"platform_global"` when a superadmin has disabled the module platform-wide
 * (or put it in maintenance, or made it platform-wide read-only), `"license"` otherwise --
 * the other three layers still have no real data source to read yet, story by story, the
 * same way `platform.plan_modules`' own `enabled` column (PLATFORM-P0-04.3) still exists
 * today with nothing yet reading it for a real authorization decision.
 *
 * PLATFORM-P0-07.3 extends the platform-global layer from a plain on/off kill switch to
 * the full `available`/`read_only`/`maintenance`/`disabled` status (decisions #1-#3 in
 * this backlog's own audit log): `maintenance` and `disabled` are the exact same full
 * block (decision #3 -- no distinct access level, only different default copy) and
 * short-circuit to `buildPlatformDisabledDecision()` exactly as the old boolean kill
 * switch already did; `read_only` (decision #2) does NOT short-circuit -- it forces
 * `writeAllowed` to `false` regardless of the business's own license, then lets
 * `buildModuleEntitlementDecision()` pick the right reason the same way it already does
 * for a business's own license grace period, reusing that existing read/write
 * distinction rather than inventing a new one.
 */
export async function hasModule(businessId: string, moduleKey: string): Promise<EntitlementDecision> {
  const platform = await getPlatformModuleStatus(moduleKey);
  if (platform.status === "disabled" || platform.status === "maintenance") {
    return buildPlatformDisabledDecision(moduleKey, platform.status, platform.message);
  }
  const [readAllowed, writeAllowedByLicense] = await Promise.all([
    hasModuleLicense(businessId, moduleKey),
    hasModuleWrite(businessId, moduleKey),
  ]);
  const writeAllowed = writeAllowedByLicense && platform.status !== "read_only";
  return buildModuleEntitlementDecision(
    moduleKey,
    readAllowed,
    writeAllowed,
    platform.status === "read_only",
    platform.message,
  );
}

/** PLATFORM-P0-07.2/07.3 -- the pure decision shape for a fully platform-blocked module
 * (`disabled` or `maintenance` -- decision #3's own "the exact same full block"), factored
 * out the same way `buildModuleEntitlementDecision()` below is, so it is unit-testable
 * without a database. Always `allowed: false`: neither status has any degraded "partial
 * access" the way `read_only` or a license's grace period does (decision #3 -- no
 * superadmin-only bypass, no partial access). `message` is the superadmin-set
 * `customer_facing_message` override, when set (decision #4) -- falls back to
 * `defaultPlatformBlockedMessage()`'s status-specific copy otherwise (the ONLY thing that
 * differs between `maintenance` and `disabled`, per decision #3). */
export function buildPlatformDisabledDecision(
  moduleKey: string,
  status: "disabled" | "maintenance",
  message: string | null = null,
): EntitlementDecision {
  const moduleName = moduleRegistry.find((m) => m.key === moduleKey)?.name ?? moduleKey;
  return {
    allowed: false,
    reason: message ?? defaultPlatformBlockedMessage(moduleName, status),
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
 *
 * `platformReadOnly` (PLATFORM-P0-07.3, decision #2) is `true` when `hasModule()`'s own
 * platform-wide status is `read_only` -- when combined with `readAllowed`, this means the
 * business's own license would otherwise permit the write, but a platform-wide read-only
 * status forces it denied anyway, so the reason names the platform-wide cause (the actual
 * reason the write failed) rather than the business's own (fine) license. When
 * `readAllowed` is `false`, the business isn't even licensed at all -- that is still the
 * more specific, more helpful reason to surface, so `platformReadOnly` is not consulted in
 * that branch. `platformMessage` is the superadmin-set `customer_facing_message`
 * override (decision #4), used only in the `platformReadOnly` branch -- falls back to
 * `defaultPlatformReadOnlyMessage()` otherwise.
 */
export function buildModuleEntitlementDecision(
  moduleKey: string,
  readAllowed: boolean,
  writeAllowed: boolean,
  platformReadOnly = false,
  platformMessage: string | null = null,
): EntitlementDecision {
  const moduleName = moduleRegistry.find((m) => m.key === moduleKey)?.name ?? moduleKey;

  if (writeAllowed) {
    return {
      allowed: true,
      reason: `${moduleName} is licensed and active.`,
      source: "license",
      limit: null,
      usage: null,
      remaining: null,
    };
  }
  if (readAllowed && platformReadOnly) {
    return {
      allowed: false,
      reason: platformMessage ?? defaultPlatformReadOnlyMessage(moduleName),
      source: "platform_global",
      limit: null,
      usage: null,
      remaining: null,
    };
  }
  if (readAllowed) {
    return {
      allowed: false,
      reason: `${moduleName}'s license is in its read-only grace period.`,
      source: "license",
      limit: null,
      usage: null,
      remaining: null,
    };
  }
  return {
    allowed: false,
    reason: `${moduleName} is not licensed for this business.`,
    source: "license",
    limit: null,
    usage: null,
    remaining: null,
  };
}
