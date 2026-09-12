import { notFound } from "next/navigation";
import { getProduct, getWorkspaceForProduct } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { getPipelineRun, listPipelineStageRunsForRun } from "@cofounderai/module-discovery/lib/pipeline/queries";
import { listAiRunsInWindow } from "@cofounderai/module-discovery/lib/ai/usage";
import { RunHistoryDetail } from "@cofounderai/module-discovery/components/pipeline/run-history-detail";

/** DISC-OFFER-P0-14.1: one Discovery Run History entry in full. `getPipelineRun` is
 * scoped to this offering's own workspace -- a runId for another workspace's run 404s
 * here exactly like an unrelated product/prospect id would anywhere else in this module,
 * never leaking whether it exists. */
export default async function RunHistoryDetailPage({
  params,
}: {
  params: Promise<{ businessId: string; productId: string; runId: string }>;
}) {
  const { businessId, productId, runId } = await params;
  const product = await getProduct(productId);
  if (!product || product.business_id !== businessId) notFound();

  const workspace = await getWorkspaceForProduct(product.id);
  if (!workspace) notFound();

  const run = await getPipelineRun(workspace.id, runId);
  if (!run) notFound();

  const [stagesExecuted, aiRuns] = await Promise.all([
    listPipelineStageRunsForRun(workspace.id, run.id),
    listAiRunsInWindow(workspace.id, run.started_at, run.completed_at),
  ]);

  return (
    <RunHistoryDetail businessId={businessId} productId={productId} run={run} stagesExecuted={stagesExecuted} aiRuns={aiRuns} />
  );
}
