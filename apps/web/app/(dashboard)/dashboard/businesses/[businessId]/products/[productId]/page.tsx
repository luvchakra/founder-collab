import { notFound } from "next/navigation";
import {
  getProduct,
  getWorkspaceForProduct,
} from "@cofounderai/module-discovery/lib/tenancy/queries";
import { listProductKnowledge } from "@cofounderai/module-discovery/lib/knowledge/queries";
import { ProductOverviewShell } from "@cofounderai/module-discovery/components/tenancy/product-overview-shell";
import {
  addFileSourceAction,
  addTextSourceAction,
  deleteSourceAction,
  generateProductProfileAction,
  updateProductDescriptionAction,
  updateProductWebsiteAction,
  updateSourceAction,
} from "./actions";

function icpPath(businessId: string, productId: string) {
  return `/dashboard/businesses/${businessId}/products/${productId}/icp`;
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ businessId: string; productId: string }>;
}) {
  const { businessId, productId } = await params;
  const product = await getProduct(productId);
  if (!product || product.business_id !== businessId) notFound();

  const workspace = await getWorkspaceForProduct(product.id);
  if (!workspace) notFound();

  const sources = await listProductKnowledge(workspace.id);

  return (
    <ProductOverviewShell
      product={product}
      sources={sources}
      websiteAction={updateProductWebsiteAction.bind(null, businessId, productId)}
      descriptionAction={updateProductDescriptionAction.bind(null, businessId, productId)}
      generateProfileAction={generateProductProfileAction.bind(null, businessId, productId)}
      addFileAction={addFileSourceAction.bind(null, businessId, productId, workspace.id)}
      addTextAction={addTextSourceAction.bind(null, businessId, productId, workspace.id)}
      updateSourceAction={(sourceId) => updateSourceAction.bind(null, businessId, productId, sourceId)}
      deleteSourceAction={(sourceId) => deleteSourceAction.bind(null, businessId, productId, sourceId)}
      nextHref={`${icpPath(businessId, productId)}?autopopulate=1`}
    />
  );
}
