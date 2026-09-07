import { createClient } from "../db/server";

/** Non-throwing check of core.has_permission() (C-7) -- for UI gating (show/hide an
 * edit control) where a denial isn't an error, just "don't render this". Server actions
 * that actually perform the write should call requirePermission() below instead, which
 * RLS backs up regardless either way. */
export async function hasPermission(businessId: string, permissionKey: string): Promise<boolean> {
  const supabase = await createClient({ schema: "core" });
  const { data, error } = await supabase.rpc("has_permission", {
    p_business_id: businessId,
    p_key: permissionKey,
  });
  if (error) throw error;
  return Boolean(data);
}

/**
 * Defense-in-depth mirror of core.has_permission() (C-7). RLS is the source of truth --
 * a write the caller lacks permission for is rejected by the database regardless of
 * whether a server action calls this first -- but calling it first turns that rejection
 * into a clear, catchable message instead of a raw Postgres policy-violation error
 * surfacing to the UI.
 */
export async function requirePermission(businessId: string, permissionKey: string): Promise<void> {
  const granted = await hasPermission(businessId, permissionKey);
  if (!granted) {
    throw new Error(`You don't have permission to do this (${permissionKey}).`);
  }
}
