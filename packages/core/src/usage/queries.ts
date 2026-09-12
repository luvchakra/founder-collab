import { createClient } from "../db/server";
import type { ResourceKey } from "../entitlements/resource-keys";
import { toUsageCounter, type UsageCounter } from "./types";

function coreClient() {
  return createClient({ schema: "core" });
}

/**
 * PLATFORM-P0-06.1/06.2 (Usage Counters / Usage Dashboard) -- every usage counter row for
 * one business, RLS-scoped through the request-scoped client (`core.usage_counters`'s own
 * "members can view usage counters for their businesses" policy, this same story) --
 * exactly the read surface PLATFORM-P0-06.2's own dashboard needs to render "Current
 * Usage" per resource. A business with no counters yet (no module has written to any
 * dimension) returns an empty array, not an error -- the dashboard's own job to render
 * that honestly (e.g. "no usage recorded yet"), not this function's.
 */
export async function listUsageCounters(businessId: string): Promise<UsageCounter[]> {
  const supabase = await coreClient();
  const { data, error } = await supabase.from("usage_counters").select("*").eq("business_id", businessId);
  if (error) throw error;
  return data.map(toUsageCounter);
}

/** One resource's own current counter row, or `null` if nothing has incremented it yet
 * (a business that has never performed the countable action this resource tracks) --
 * `getLimit()` (`entitlements/limit-entitlement.ts`) will read through this once
 * PLATFORM-P0-06.3 wires real usage into that function's own `usage`/`remaining` fields. */
export async function getUsageCounter(businessId: string, resourceKey: ResourceKey, period = "current"): Promise<UsageCounter | null> {
  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("usage_counters")
    .select("*")
    .eq("business_id", businessId)
    .eq("resource_key", resourceKey)
    .eq("period", period)
    .maybeSingle();
  if (error) throw error;
  return data ? toUsageCounter(data) : null;
}
