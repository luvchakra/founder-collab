import { createClient } from "../db/server";
import type { ModuleKey } from "./types";

/**
 * Layer 3 of licensing's four required enforcement layers (00-MASTER-PLAN.md §
 * "Enforcement — four layers, all four required"): call this at the top of every mutating
 * server action in a licensed module.
 *
 * RLS remains the real gate — a write into an unlicensed module's tables is rejected by
 * the database whether or not an action calls this first. What this adds is a clear,
 * catchable message instead of a raw policy-violation error surfacing to the UI, exactly
 * as `rbac/require-permission.ts` does for permissions.
 *
 * `write: true` (the default for a mutating action) checks `core.has_module_write()`,
 * which is false during ADR-9's read-only grace window; `write: false` checks
 * `core.has_module()`, which stays true through grace. Use the latter only to guard a
 * read that has no RLS-covered path of its own.
 */
export async function requireModule(
  businessId: string,
  moduleKey: ModuleKey,
  options: { write?: boolean } = {},
): Promise<void> {
  const write = options.write ?? true;
  const supabase = await createClient({ schema: "core" });
  const { data, error } = await supabase.rpc(write ? "has_module_write" : "has_module", {
    p_business_id: businessId,
    p_key: moduleKey,
  });
  if (error) throw error;
  if (!data) {
    throw new Error(
      write
        ? `The ${moduleKey} module is not licensed for write access on this business.`
        : `The ${moduleKey} module is not licensed on this business.`,
    );
  }
}

/**
 * Non-throwing counterpart, for a caller that treats "not licensed" as a normal result
 * rather than an error — ADR-10's degraded modes (CLAUDE.md non-negotiable #6: a contract
 * call may return MODULE_NOT_LICENSED and callers must treat that as a normal result).
 */
export async function hasModule(
  businessId: string,
  moduleKey: ModuleKey,
  options: { write?: boolean } = {},
): Promise<boolean> {
  const supabase = await createClient({ schema: "core" });
  const { data, error } = await supabase.rpc(options.write ? "has_module_write" : "has_module", {
    p_business_id: businessId,
    p_key: moduleKey,
  });
  if (error) throw error;
  return data === true;
}
