/**
 * The closed list `20260912050000_platform_plan_limits.sql`'s own `resource_key` CHECK
 * constraint enforces (PLATFORM-P0-04.5, "Configurable limits"). Also the CHECK
 * `20260912090000_core_usage_counters.sql` (PLATFORM-P0-06.1) reuses verbatim for its own
 * `resource_key` column -- a business's usage and its plan's limit must speak the same
 * closed vocabulary, or `getLimit()` (`limit-entitlement.ts`) could never honestly compare
 * one against the other. Kept in sync with both migrations by hand (all three are short,
 * static lists; a real "generate types from the DB" pipeline is more machinery than this
 * needs today, per CLAUDE.md's "simplest implementation that works").
 */
export const RESOURCE_KEYS = [
  "businesses",
  "users",
  "business_offerings",
  "products",
  "contacts",
  "prospects",
  "opportunities",
  "ai_runs",
  "ai_credits",
  "whatsapp_conversations",
  "storage",
  "api_calls",
  "automation_runs",
] as const;
export type ResourceKey = (typeof RESOURCE_KEYS)[number];

/**
 * The subset of `RESOURCE_KEYS` that are periodic-consumption dimensions -- reset each
 * calendar month, tracked in `core.usage_counters` under a `'YYYY-MM'` period key rather
 * than the `'current'` running-total sentinel every other resource uses. See that
 * migration's own docstring for the full reasoning. Used by
 * `entitlements/limit-entitlement.ts`'s `getLimit()` to know which period to look a
 * resource's own usage counter up under.
 */
export const PERIODIC_RESOURCE_KEYS = [
  "ai_runs",
  "ai_credits",
  "whatsapp_conversations",
  "storage",
  "api_calls",
  "automation_runs",
] as const satisfies readonly ResourceKey[];

export function isPeriodicResource(resourceKey: ResourceKey): boolean {
  return (PERIODIC_RESOURCE_KEYS as readonly string[]).includes(resourceKey);
}
