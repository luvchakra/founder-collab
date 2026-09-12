import { createClient } from "../db/server";
import type { ResourceKey } from "../entitlements/resource-keys";
import { toUsageCounter, type UsageCounter } from "./types";

function coreClient() {
  return createClient({ schema: "core" });
}

/**
 * PLATFORM-P0-06.1 (Usage Counters) -- the one write path a module calls "when it
 * performs a countable action" (this run's own task brief, verbatim). Thin wrapper over
 * `core.increment_usage_counter()` (this same story's own migration): an atomic
 * upsert-and-increment, `security definer` so concurrent callers never race a
 * read-then-write, with its own tenant-membership check baked in (rejects a business the
 * caller doesn't belong to, regardless of the elevated privilege the function itself
 * runs with).
 *
 * `delta` defaults to `1` (the common "one more of this happened" case, e.g. a prospect
 * created); pass a negative value to decrement a running (`period: "current"`) total when
 * something is deleted (a business/product/prospect count going back down) -- periodic
 * consumption dimensions (ai_runs, api_calls, ...) should essentially never decrement.
 * The count never goes below zero (`core.increment_usage_counter()`'s own `greatest(...,
 * 0)`), so a mismatched decrement can't produce a nonsensical negative usage number.
 *
 * **No module calls this yet** -- per this run's own task brief, wiring up each module's
 * own countable actions is that module's future integration work, not this story's.
 */
export async function incrementUsageCounter(
  businessId: string,
  resourceKey: ResourceKey,
  delta = 1,
  period = "current",
): Promise<UsageCounter> {
  const supabase = await coreClient();
  const { data, error } = await supabase.rpc("increment_usage_counter", {
    p_business_id: businessId,
    p_resource_key: resourceKey,
    p_delta: delta,
    p_period: period,
  });
  if (error) throw error;
  return toUsageCounter(data);
}
