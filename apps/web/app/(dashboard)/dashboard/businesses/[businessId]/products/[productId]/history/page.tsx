import { notFound } from "next/navigation";
import { getProduct, getWorkspaceForProduct } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { listPipelineRuns } from "@cofounderai/module-discovery/lib/pipeline/queries";
import { RunHistoryList } from "@cofounderai/module-discovery/components/pipeline/run-history-list";

/** DISC-OFFER-P0-14.1: "Discovery Run History" -- this offering's own list of past AI
 * Discovery runs, most recent first. See `RunHistoryList`'s own comment for why each row
 * links out to its own detail page rather than showing everything inline. */
export default async function RunHistoryPage({
  params,
}: {
  params: Promise<{ businessId: string; productId: string }>;
}) {
  const { businessId, productId } = await params;
  const product = await getProduct(productId);
  if (!product || product.business_id !== businessId) notFound();

  const workspace = await getWorkspaceForProduct(product.id);
  if (!workspace) notFound();

  const runs = await listPipelineRuns(workspace.id);

  return <RunHistoryList businessId={businessId} productId={productId} runs={runs} />;
}
