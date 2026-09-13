import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
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
  const basePath = `/${businessSlug}/products/${productId}/prospects`;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-medium">Watchlist</h1>
        <p className="text-sm text-muted-foreground">Accounts you&apos;re deliberately keeping an eye on for this offering.</p>
      </div>
      <WatchlistDashboard basePath={basePath} rows={rows} />
    </div>
  );
}
