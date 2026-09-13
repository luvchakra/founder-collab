import { getConversationCountsForWorkspaces } from "../conversations/queries";
import { listOpportunitySummariesForWorkspaces } from "../opportunities/queries";
import { listProspectsForWorkspaces } from "../prospects/queries";
import { listProducts, listWorkspacesForProducts } from "../tenancy/queries";
import { groupIntoCrossOfferingAccounts } from "./accounts";
import { computeOfferingPortfolioRows } from "./portfolio";
import type { CrossOfferingAccount, OfferingPortfolioRow } from "./types";

export type BusinessPortfolioData = {
  offeringRows: OfferingPortfolioRow[];
  crossOfferingAccounts: CrossOfferingAccount[];
};

/**
 * DISC-OFFER-P1 §7-04 "Multi-Offering Intelligence" -- one call for both stories in this
 * epic, since both need the exact same batched reads (this business's own products/
 * workspaces, every prospect and open opportunity across them, conversation counts per
 * workspace). Returns empty results with no queries beyond `listProducts` for a business
 * with fewer than two offerings -- there is nothing to roll up or cross-reference yet,
 * the same "nothing to show" case DISC-OFFER-P1 §7-01.3's own watchlist empty state
 * already treats as a normal result, not an error.
 */
export async function getBusinessPortfolioData(businessId: string): Promise<BusinessPortfolioData> {
  const products = await listProducts(businessId);
  if (products.length === 0) return { offeringRows: [], crossOfferingAccounts: [] };

  const workspaces = await listWorkspacesForProducts(products.map((p) => p.id));
  const workspaceByProductId = new Map(workspaces.map((w) => [w.product_id, w] as const));
  const offerings = products.flatMap((product) => {
    const workspace = workspaceByProductId.get(product.id);
    return workspace ? [{ productId: product.id, productName: product.name, workspaceId: workspace.id }] : [];
  });
  const workspaceIds = offerings.map((o) => o.workspaceId);

  const [prospects, opportunities, conversationCounts] = await Promise.all([
    listProspectsForWorkspaces(workspaceIds),
    listOpportunitySummariesForWorkspaces(workspaceIds),
    getConversationCountsForWorkspaces(workspaceIds),
  ]);

  const offeringByWorkspaceId = new Map(offerings.map((o) => [o.workspaceId, o] as const));
  const prospectsWithOffering = prospects.flatMap((prospect) => {
    const offering = offeringByWorkspaceId.get(prospect.workspace_id);
    return offering ? [{ prospect, productId: offering.productId, productName: offering.productName }] : [];
  });

  return {
    offeringRows: computeOfferingPortfolioRows(offerings, opportunities, conversationCounts),
    crossOfferingAccounts: groupIntoCrossOfferingAccounts(prospectsWithOffering, opportunities),
  };
}
