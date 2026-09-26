import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { ExportMenu } from "@cofounderai/core/export-ui/export-menu";
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-medium">Performance analysis</h1>
          <p className="text-sm text-muted-foreground">What&apos;s actually working for this offering, computed from everything discovered so far.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ExportMenu exportId="discovery.performance" businessSlug={businessSlug} params={{ productId }} kind="report" />
        </div>
      </div>
      <OfferingPerformanceAnalysisView analysis={analysis} />
    </div>
  );
}
