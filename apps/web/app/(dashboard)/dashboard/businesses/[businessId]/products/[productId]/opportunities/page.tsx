import { notFound } from "next/navigation";
import { getProduct, getWorkspaceForProduct } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { getOpportunityDashboardRows } from "@cofounderai/module-discovery/lib/opportunities/dashboard-queries";
import { OpportunitiesDashboard } from "@cofounderai/module-discovery/components/opportunities/opportunities-dashboard";

export default async function OpportunitiesPage({
  params,
}: {
  params: Promise<{ businessId: string; productId: string }>;
}) {
  const { businessId, productId } = await params;
  const product = await getProduct(productId);
  if (!product || product.business_id !== businessId) notFound();

  const workspace = await getWorkspaceForProduct(product.id);
  if (!workspace) notFound();

  const rows = await getOpportunityDashboardRows(workspace.id);

  return <OpportunitiesDashboard businessId={businessId} productId={productId} rows={rows} />;
}
