import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { ExportMenu } from "@cofounderai/core/export-ui/export-menu";
import { getProduct, getWorkspaceForProduct } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { getWatchlistDashboardRows } from "@cofounderai/module-discovery/lib/watchlist/queries";
import { WatchlistDashboard } from "@cofounderai/module-discovery/components/prospects/watchlist-dashboard";

export default async function WatchlistPage({
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

  const rows = await getWatchlistDashboardRows(workspace.id);
  const basePath = `/${businessSlug}/discovery/offerings/${productId}/prospects`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-medium">Watchlist</h1>
          <p className="text-sm text-muted-foreground">Accounts you&apos;re deliberately keeping an eye on for this offering.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ExportMenu exportId="discovery.watchlist" businessSlug={businessSlug} params={{ productId }} />
        </div>
      </div>
      <WatchlistDashboard basePath={basePath} rows={rows} />
    </div>
  );
}
