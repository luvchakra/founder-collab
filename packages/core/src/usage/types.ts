import type { ResourceKey } from "../entitlements/resource-keys";

export type { ResourceKey } from "../entitlements/resource-keys";

/** Mirrors `core.usage_counters` (PLATFORM-P0-06.1). `period` is `"current"` for a
 * running, never-reset total, or a `"YYYY-MM"` calendar-month key for a periodic
 * consumption dimension -- see that migration's own docstring for which resources use
 * which shape. */
export type UsageCounter = {
  id: string;
  businessId: string;
  resourceKey: ResourceKey;
  period: string;
  count: number;
  updatedAt: string;
};

type UsageCounterRow = {
  id: string;
  business_id: string;
  resource_key: ResourceKey;
  period: string;
  count: number;
  updated_at: string;
};

export function toUsageCounter(row: UsageCounterRow): UsageCounter {
  return {
    id: row.id,
    businessId: row.business_id,
    resourceKey: row.resource_key,
    period: row.period,
    count: row.count,
    updatedAt: row.updated_at,
  };
}

/**
 * `'current'` for a running total, or the UTC calendar-month key (`'YYYY-MM'`) a
 * periodic-consumption resource's usage resets against -- the same two shapes
 * `20260912090000_core_usage_counters.sql`'s own `period` CHECK constraint allows.
 * Pure and directly unit-tested (no clock/timezone surprises hidden in a DB default).
 */
export function currentMonthPeriod(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}
