import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { getProduct, getWorkspaceForProduct } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { getPerformanceAnalysisRawData } from "@cofounderai/module-discovery/lib/performance-analysis/queries";
import { computeOfferingPerformanceAnalysis } from "@cofounderai/module-discovery/lib/performance-analysis/analysis";
import { OfferingPerformanceAnalysisView } from "@cofounderai/module-discovery/components/pipeline/offering-performance-analysis";

export default async function PerformanceAnalysisPage({
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

  const raw = await getPerformanceAnalysisRawData(workspace.id);
  const analysis = computeOfferingPerformanceAnalysis(raw);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-medium">Performance analysis</h1>
        <p className="text-sm text-muted-foreground">What&apos;s actually working for this offering, computed from everything discovered so far.</p>
      </div>
      <OfferingPerformanceAnalysisView analysis={analysis} />
    </div>
  );
}
