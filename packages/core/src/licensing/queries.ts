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
