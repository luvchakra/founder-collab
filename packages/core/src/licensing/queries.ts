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
