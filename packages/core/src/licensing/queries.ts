import { moduleRegistry } from "@cofounderai/module-registry";
import { createClient } from "../db/server";
import type { License } from "./types";

function coreClient() {
  return createClient({ schema: "core" });
}

/** Every license row for one business -- RLS-scoped (core.licenses' own "members can
 * view their business licenses" policy, C-3), never the admin client: this is a read for
 * the signed-in user's own settings page, not a privileged operation. */
export async function listLicensesForBusiness(businessId: string): Promise<License[]> {
  const supabase = await coreClient();
  const { data, error } = await supabase.from("licenses").select("*").eq("business_id", businessId);
  if (error) throw error;
  return data;
}

/** Active-or-grace module keys for several businesses at once, grouped by business_id --
 * one query instead of N `listLicensesForBusiness()` calls. Built for the dashboard
 * shell (P0 fix, 2026-09-08: the sidebar/module-switcher was passing the raw, unfiltered
 * module-registry straight through with no license check at all -- see
 * docs/testing/EXECUTION-2026-09-08.md finding 5) but generically useful anywhere a
 * caller already has every business on an account and needs "what's licensed for each."
 * RLS-scoped, same as listLicensesForBusiness() -- a business the caller doesn't belong
 * to simply contributes no rows, never an error. A business with no rows in the result
 * has no licensed modules at all (not even discovery) -- callers should treat a missing
 * key the same as an empty array, not throw. */
export async function listLicensedModuleKeysByBusiness(
  businessIds: string[],
): Promise<Record<string, string[]>> {
  if (businessIds.length === 0) return {};
  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("licenses")
    .select("business_id, module_key, status")
    .in("business_id", businessIds)
    .in("status", ["active", "grace"]);
  if (error) throw error;

  const result: Record<string, string[]> = {};
  for (const row of data) {
    (result[row.business_id] ??= []).push(row.module_key);
  }
  return result;
}

/** Thin wrapper over core.has_module() (C-3) -- the pre-check a contract/index.ts
 * function (00-MASTER-PLAN.md §6 mechanism 2) uses to return a clean `MODULE_NOT_LICENSED`
 * result instead of letting the caller hit a raw RLS policy-violation error, per ADR-10:
 * "a contract call may return MODULE_NOT_LICENSED and callers must treat that as a normal
 * result, not an exception." RLS itself stays the authoritative backstop either way. */
export async function hasModule(businessId: string, moduleKey: string): Promise<boolean> {
  const supabase = await coreClient();
  const { data, error } = await supabase.rpc("has_module", { p_business_id: businessId, p_key: moduleKey });
  if (error) throw error;
  return Boolean(data);
}

/** Thin wrapper over core.has_module_write() (C-3) -- true only for an `active` license,
 * false during `grace` (read-only) or `expired`/no license at all. `requireModule()`
 * below is the write-gating counterpart to this; `hasModule()` above is the read-gating
 * one. */
export async function hasModuleWrite(businessId: string, moduleKey: string): Promise<boolean> {
  const supabase = await coreClient();
  const { data, error } = await supabase.rpc("has_module_write", { p_business_id: businessId, p_key: moduleKey });
  if (error) throw error;
  return Boolean(data);
}

/** PLATFORM-P0-07.2 ("Platform-Wide Module Kill Switch") -- whether `moduleKey` is
 * enabled platform-wide, independent of any business's own license. Reads
 * `platform.modules` directly, not through `@cofounderai/core/admin/platform-modules`
 * (that file's every export requires `requireSuperadmin()`, appropriate for the
 * `/platform` admin UI but wrong here: this must work for any ordinary, signed-in
 * business member checking their own entitlements). Safe without an admin gate because
 * `platform.modules`' own RLS already opens SELECT to any authenticated user -- the same
 * "public catalog fact" trust level `core.modules`' own read policy already established
 * (see that migration's own docstring). A module with no row at all (should never happen
 * once seeded, but defensive) defaults to enabled, matching `platform.modules`' own
 * migration-level default -- a missing row must never silently disable a module. */
export async function isModuleEnabledPlatformWide(moduleKey: string): Promise<boolean> {
  const supabase = await createClient({ schema: "platform" });
  const { data, error } = await supabase
    .from("modules")
    .select("enabled")
    .eq("module_key", moduleKey)
    .maybeSingle();
  if (error) throw error;
  return data?.enabled ?? true;
}

/**
 * Defense-in-depth mirror of core.has_module_write() (C-3/ADR-9) -- CLAUDE.md's
 * architecture section names this exact function as one of licensing's four required
 * enforcement layers ("requireModule() in server actions (defense in depth)"), which
 * previously didn't exist anywhere in the codebase (docs/testing/EXECUTION-2026-09-08.md
 * finding 4, from TC-CORE-001): every plain in-module write relied on RLS alone, with no
 * app-layer check of its own. RLS stays the authoritative backstop regardless -- same
 * relationship requirePermission() has to has_permission() -- but calling this first
 * turns a cancelled/unlicensed business's write attempt into a clear, catchable message
 * instead of a raw Postgres policy-violation error surfacing to the UI.
 *
 * Rolled out across every module's own write paths (fsm/inventory/crm/gst mutations.ts,
 * ~70 functions) except cron/webhook-reachable paths (no signed-in user to check) and
 * plain id-only setters (RLS-only, same as this platform's other modules' equivalents).
 *
 * The thrown message names the module by its display name (module-registry's own
 * `name`, e.g. "Compliance," not the internal key "gst" a business owner has never seen
 * anywhere in the UI) -- the same lookup `not-licensed/page.tsx`'s route guard already
 * does, so a toast surfacing this message reads consistently with that page rather than
 * leaking an internal identifier the moment someone's session outlives their license's
 * grace window mid-page instead of getting caught by the route guard on load.
 *
 * PLATFORM-P0-07.2: the platform-wide kill switch is checked first, before this
 * business's own license -- it is the more universal fact (it blocks every business, not
 * just this one), and its own error message is deliberately distinct so a caller (or a
 * toast surfacing this message) never tells a business owner to go check their license
 * for a problem their license has nothing to do with. */
export async function requireModule(businessId: string, moduleKey: string): Promise<void> {
  const moduleName = moduleRegistry.find((m) => m.key === moduleKey)?.name ?? moduleKey;

  const platformEnabled = await isModuleEnabledPlatformWide(moduleKey);
  if (!platformEnabled) {
    throw new Error(`${moduleName} has been temporarily disabled platform-wide by WonderArc.`);
  }

  const licensed = await hasModuleWrite(businessId, moduleKey);
  if (!licensed) {
    throw new Error(`${moduleName} isn't licensed (or is in its read-only grace period) for this business.`);
  }
}
