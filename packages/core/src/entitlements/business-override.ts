import { createClient } from "../db/server";
import type { ResourceKey } from "./resource-keys";
import type { EntitlementDecision } from "./types";

/**
 * PLATFORM-P1-02.1/02.2 ("Business Override" / "Temporary Entitlement", §24) -- the
 * Business Override layer of PLATFORM-P0-05.2's precedence chain, read from
 * `platform.business_overrides` (20260927201000_platform_business_overrides.sql).
 *
 * An override is in force only between its `startsAt` and `expiresAt` and only until it is
 * revoked -- every override carries an expiry by construction (02.2), so an exception can
 * never quietly become permanent. Read through the caller's own session: the table's RLS
 * shows a business's overrides to its own members, and to superadmins.
 */

export type BusinessOverrideRow = {
  id: string;
  override_type: "feature" | "limit";
  limit_value: number | null;
  reason: string;
  starts_at: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
};

/** Pure: is this override in force at `now`? */
export function isOverrideActive(row: Pick<BusinessOverrideRow, "starts_at" | "expires_at" | "revoked_at">, now: Date = new Date()): boolean {
  return row.revoked_at === null && new Date(row.starts_at) <= now && new Date(row.expires_at) > now;
}

/** Pure: the override that applies -- the newest in-force one -- or null. */
export function pickActiveOverride<T extends BusinessOverrideRow>(rows: T[], now: Date = new Date()): T | null {
  return rows.filter((r) => isOverrideActive(r, now)).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0] ?? null;
}

const COLUMNS = "id, override_type, limit_value, reason, starts_at, expires_at, revoked_at, created_at";

export async function getActiveFeatureOverride(businessId: string, moduleKey: string, featureKey: string): Promise<BusinessOverrideRow | null> {
  const platform = await createClient({ schema: "platform" });
  const { data, error } = await platform
    .from("business_overrides")
    .select(COLUMNS)
    .eq("business_id", businessId)
    .eq("override_type", "feature")
    .eq("module_key", moduleKey)
    .eq("feature_key", featureKey)
    .is("revoked_at", null);
  if (error) throw error;
  return pickActiveOverride((Array.isArray(data) ? data : []) as BusinessOverrideRow[]);
}

export async function getActiveLimitOverride(businessId: string, resourceKey: ResourceKey): Promise<BusinessOverrideRow | null> {
  const platform = await createClient({ schema: "platform" });
  const { data, error } = await platform
    .from("business_overrides")
    .select(COLUMNS)
    .eq("business_id", businessId)
    .eq("override_type", "limit")
    .eq("resource_key", resourceKey)
    .is("revoked_at", null);
  if (error) throw error;
  return pickActiveOverride((Array.isArray(data) ? data : []) as BusinessOverrideRow[]);
}

function untilLabel(expiresAt: string): string {
  return new Date(expiresAt).toISOString().slice(0, 10);
}

/** Pure: a feature granted by an override (source `business_override`). */
export function buildFeatureOverrideDecision(featureName: string, override: BusinessOverrideRow): EntitlementDecision {
  return {
    allowed: true,
    reason: `${featureName} is granted to this business by a temporary exception until ${untilLabel(override.expires_at)}.`,
    source: "business_override",
    limit: null,
    usage: null,
    remaining: null,
  };
}

/** Pure: a limit replaced by an override. Overrides are hard limits (or unlimited). */
export function buildLimitOverrideDecision(resourceKey: ResourceKey, override: BusinessOverrideRow, usage: number): EntitlementDecision {
  const until = untilLabel(override.expires_at);
  if (override.limit_value === null) {
    return {
      allowed: true,
      reason: `${resourceKey} is unlimited for this business until ${until} (temporary exception).`,
      source: "business_override",
      limit: null,
      usage,
      remaining: null,
    };
  }
  const limit = override.limit_value;
  const allowed = usage < limit;
  return {
    allowed,
    reason: allowed
      ? `${resourceKey} usage (${usage}) is within this business's temporary limit of ${limit} (until ${until}).`
      : `This business's temporary limit allows ${limit} ${resourceKey} (until ${until}).`,
    source: "business_override",
    limit,
    usage,
    remaining: Math.max(limit - usage, 0),
  };
}
