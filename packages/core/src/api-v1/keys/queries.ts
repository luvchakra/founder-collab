import { createClient } from "../../db/server";
import type { ApiKeySummary } from "./types";

/** RLS ("business read" on core.api_keys, gated by settings.manage) is what actually
 * enforces that only a permitted caller sees these -- businessId here is a filter for
 * "which business", not an authorization check. Never returns key_hash (there's no
 * SELECT policy on core.api_key_secrets at all -- the raw key is shown once, at
 * creation, and never again). */
export async function listApiKeys(businessId: string): Promise<ApiKeySummary[]> {
  const supabase = await createClient({ schema: "core" });
  const { data, error } = await supabase
    .from("api_keys")
    .select("id, name, key_prefix, permissions, created_at, last_used_at, revoked_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}
