import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { getProduct, getWorkspaceForProduct } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { getOpportunityDashboardRows } from "@cofounderai/module-discovery/lib/opportunities/dashboard-queries";
import { OpportunitiesDashboard } from "@cofounderai/module-discovery/components/opportunities/opportunities-dashboard";
import { setOpportunityStatusFromListAction, researchAgainFromListAction } from "./actions";

export default async function OpportunitiesPage({
  params,
}: {
  params: Promise<{ businessSlug: string; productId: string }>;
}) {
  const { businessSlug, productId } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();
  const product = await getProduct(productId);
  if (!product || product.business_id !== businessId) notFound();

  const workspace = await getWorkspaceForProduct(product.id);
  if (!workspace) notFound();

  const rows = await getOpportunityDashboardRows(workspace.id);

  return (
    <OpportunitiesDashboard
      businessId={businessId}
      productId={productId}
      rows={rows}
      setStatusAction={setOpportunityStatusFromListAction.bind(null, businessId, productId)}
      researchAgainAction={researchAgainFromListAction.bind(null, businessId, productId)}
    />
  );
}
