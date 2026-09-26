import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { ExportMenu } from "@cofounderai/core/export-ui/export-menu";
import { getProduct, getWorkspaceForProduct } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { getOtherOfferingWatches, getWatchlistDashboardRows } from "@cofounderai/module-discovery/lib/watchlist/queries";
import { WatchlistDashboard } from "@cofounderai/module-discovery/components/prospects/watchlist-dashboard";
import { WatchlistRowActions } from "@cofounderai/module-discovery/components/prospects/watchlist-row-actions";
import { getOpportunityAlertGroupsForWorkspace } from "@cofounderai/module-discovery/lib/alerts/opportunity-alerts";
import { HeatingUpAlerts } from "@cofounderai/module-discovery/components/opportunities/heating-up-alerts";
import { removeWatchFromListAction, updateWatchFromListAction } from "./actions";

/** The offering's Signals page (the Customer Acquisition "Signals" item points here):
 * accounts heating up (DISC-OFFER-P1-01.4, one grouped alert per account) above the
 * watchlist (DISC-OFFER-P1-01.3, watched accounts in review order, editable in place). */
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

  const [rows, heatingUp] = await Promise.all([
    getWatchlistDashboardRows(workspace.id),
    getOpportunityAlertGroupsForWorkspace(workspace.id),
  ]);
  const otherOfferingWatches = await getOtherOfferingWatches(businessId, workspace.id, rows);
  const basePath = `/${businessSlug}/discovery/offerings/${productId}/prospects`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-medium">Signals &amp; watchlist</h1>
          <p className="text-sm text-muted-foreground">Accounts showing new buying signals, and the ones you&apos;re deliberately keeping an eye on for this offering.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ExportMenu exportId="discovery.watchlist" businessSlug={businessSlug} params={{ productId }} />
        </div>
      </div>
      <HeatingUpAlerts groups={heatingUp} prospectsBasePath={basePath} />
      <section aria-labelledby="watchlist-heading" className="flex flex-col gap-3">
        <h2 id="watchlist-heading" className="text-sm font-medium text-foreground">
          Watchlist
        </h2>
        <WatchlistDashboard
          basePath={basePath}
          rows={rows}
          otherOfferingWatches={otherOfferingWatches}
          renderActions={(row) => (
            <WatchlistRowActions
              companyName={row.prospectCompanyName}
              watchReason={row.watch_reason}
              nextReviewAt={row.next_review_at}
              accountHref={`${basePath}/${row.prospect_id}`}
              updateAction={updateWatchFromListAction.bind(null, businessId, productId, row.id)}
              removeAction={removeWatchFromListAction.bind(null, businessId, productId, row.id)}
            />
          )}
        />
      </section>
    </div>
  );
}
