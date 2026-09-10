import type { SupabaseClient } from "@supabase/supabase-js";
import { consumePurchasedAiCredit } from "@cofounderai/core/billing/queries";
import { createAdminClient } from "@cofounderai/core/db/admin";
import { getWorkspaceUsage } from "./queries";
import { getAccountIdForWorkspace } from "../tenancy/queries";

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
 * instead of silently spending on a call that was never going to be allowed.
 *
 * Free-tier check first, unchanged from before purchased credits existed -- zero added
 * cost (no extra query, identical behavior) for the common case of a workspace that's
 * still within its own monthly allowance. Only once that check would otherwise fail does
 * this look at the owning account's purchased-credit balance (packages/core/src/billing)
 * as a fallback: `consumePurchasedAiCredit` atomically spends one purchased run and, if
 * that succeeds, the call is allowed through despite the workspace being over its free
 * allowance. An account with no purchases (the overwhelming majority) never touches this
 * path at all.
 */
export async function assertWithinUsageLimit(
  workspaceId: string,
  client?: SupabaseClient,
): Promise<void> {
  const usage = await getWorkspaceUsage(workspaceId, client);
  const overRuns = usage.totalRuns >= FREE_TIER_MONTHLY_RUN_LIMIT;
  const overCost = usage.totalCost >= FREE_TIER_MONTHLY_COST_LIMIT_USD;
  if (!overRuns && !overCost) return;

  const accountId = await getAccountIdForWorkspace(workspaceId, client);
  if (accountId) {
    // `client`, when passed, is a discovery-schema admin client (the no-session webhook
    // path, e.g. classify-reply.ts) -- consume_purchased_ai_credit() lives in `core` and
    // is only grant-executable by an authenticated session, so that path needs its own
    // core-schema admin client (bypasses the grant check entirely) rather than the one
    // threaded through, same reasoning getAccountIdForWorkspace() above already applies.
    const creditClient = client ? createAdminClient({ schema: "core" }) : undefined;
    if (await consumePurchasedAiCredit(accountId, creditClient)) return;
  }

  if (overRuns) throw new UsageLimitExceededError("runs");
  throw new UsageLimitExceededError("cost");
}
