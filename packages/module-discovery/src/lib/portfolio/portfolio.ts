import { classifyOpportunityForDashboard } from "../opportunities/dashboard";
import type { OfferingPortfolioRow, OpportunitySummary } from "./types";

/**
 * DISC-OFFER-P1 §7-04.2 "Offering Portfolio Dashboard" -- the doc's own three columns
 * (Hot, New, Conversations) per offering. "Hot"/"New" reuse `classifyOpportunityForDashboard`
 * (DISC-OFFER-P0-07.2) wholesale rather than a second bin definition -- the doc's own
 * bin names are already this exact vocabulary, so a founder sees the same "Hot" here as
 * on that offering's own Today's Opportunities dashboard, not a second, differently
 * defined "Hot." Every other dashboard bin (Needs Review/Watching/Insufficient Evidence)
 * is real but isn't one of the three columns this story's own doc text names, so it's
 * left out rather than added unasked.
 */
export function computeOfferingPortfolioRows(
  offerings: { productId: string; productName: string; workspaceId: string }[],
  opportunities: OpportunitySummary[],
  conversationCountsByWorkspaceId: Record<string, number>,
): OfferingPortfolioRow[] {
  const binCountsByWorkspaceId = new Map<string, { hot: number; new: number }>();
  for (const o of opportunities) {
    const bin = classifyOpportunityForDashboard(o);
    if (bin !== "hot" && bin !== "new") continue;
    const counts = binCountsByWorkspaceId.get(o.workspace_id) ?? { hot: 0, new: 0 };
    if (bin === "hot") counts.hot += 1;
    else counts.new += 1;
    binCountsByWorkspaceId.set(o.workspace_id, counts);
  }

  return offerings.map((offering) => {
    const counts = binCountsByWorkspaceId.get(offering.workspaceId) ?? { hot: 0, new: 0 };
    return {
      productId: offering.productId,
      productName: offering.productName,
      workspaceId: offering.workspaceId,
      hotCount: counts.hot,
      newCount: counts.new,
      conversationCount: conversationCountsByWorkspaceId[offering.workspaceId] ?? 0,
    };
  });
}
