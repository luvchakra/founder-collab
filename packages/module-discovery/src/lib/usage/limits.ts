import type { SupabaseClient } from "@supabase/supabase-js";
import { getWorkspaceUsage } from "./queries";

/**
 * MVP free tier (blueprint §22): no billing/Stripe yet, just soft monthly caps on AI usage
 * per workspace so a single workspace can't run up unbounded API spend. Revisit once paid
 * plans exist.
 *
 * Two independent caps -- run count and total cost -- because they catch different
 * failure modes: run count catches "too many cheap calls," cost catches "too few very
 * expensive calls" (a handful of discover_prospects/research_prospect web-search runs can
 * burn real money while staying well under the run-count cap). Whichever is hit first
 * blocks further AI calls.
 */
export const FREE_TIER_MONTHLY_RUN_LIMIT = 200;
export const FREE_TIER_MONTHLY_COST_LIMIT_USD = 20;

export class UsageLimitExceededError extends Error {
  constructor(reason: "runs" | "cost") {
    super(
      reason === "runs"
        ? `This workspace has used its free-tier allowance of ${FREE_TIER_MONTHLY_RUN_LIMIT} AI runs this month. Try again next month.`
        : `This workspace has used its free-tier allowance of $${FREE_TIER_MONTHLY_COST_LIMIT_USD} in AI spend this month. Try again next month.`,
    );
    this.name = "UsageLimitExceededError";
  }
}

/** Call before any AI-invoking operation so a workspace over its limit gets a clear error
 * instead of silently spending on a call that was never going to be allowed. */
export async function assertWithinUsageLimit(
  workspaceId: string,
  client?: SupabaseClient,
): Promise<void> {
  const usage = await getWorkspaceUsage(workspaceId, client);
  if (usage.totalRuns >= FREE_TIER_MONTHLY_RUN_LIMIT) {
    throw new UsageLimitExceededError("runs");
  }
  if (usage.totalCost >= FREE_TIER_MONTHLY_COST_LIMIT_USD) {
    throw new UsageLimitExceededError("cost");
  }
}
