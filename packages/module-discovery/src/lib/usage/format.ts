import { FREE_TIER_MONTHLY_COST_LIMIT_USD } from "./limits";

/** Founder-facing label per `ai_runs.operation` value -- shared by every usage view
 * (product-level, business-level) so the wording never drifts between them. */
export const OPERATION_LABEL: Record<string, string> = {
  understand_product: "Product profile",
  generate_icp: "ICP generation",
  research_prospect: "Prospect research",
  discover_prospects: "Prospect discovery",
  generate_outreach_strategy: "Outreach strategy",
  generate_outreach_message: "Message generation",
  generate_reply: "Reply generation",
  classify_reply: "Reply classification",
  chat: "AI assistant",
};

/** Founder-facing usage is expressed as "% of AI credits used," never a raw dollar
 * figure -- the underlying free-tier cap is still tracked in USD (limits.ts), this is
 * just the display framing. Clamped to 100 since spend can exceed the cap briefly before
 * assertWithinUsageLimit blocks further runs. */
export function creditsUsedPercent(totalCost: number, limitUsd = FREE_TIER_MONTHLY_COST_LIMIT_USD): number {
  if (limitUsd <= 0) return 0;
  return Math.min(100, Math.round((totalCost / limitUsd) * 100));
}
