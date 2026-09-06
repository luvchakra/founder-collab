import { FREE_TIER_MONTHLY_COST_LIMIT_USD } from "./limits";

/** Founder-facing usage is expressed as "% of AI credits used," never a raw dollar
 * figure -- the underlying free-tier cap is still tracked in USD (limits.ts), this is
 * just the display framing. Clamped to 100 since spend can exceed the cap briefly before
 * assertWithinUsageLimit blocks further runs. */
export function creditsUsedPercent(totalCost: number, limitUsd = FREE_TIER_MONTHLY_COST_LIMIT_USD): number {
  if (limitUsd <= 0) return 0;
  return Math.min(100, Math.round((totalCost / limitUsd) * 100));
}
