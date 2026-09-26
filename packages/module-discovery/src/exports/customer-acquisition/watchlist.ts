// EXP-DISC-12 -- Discovery Watchlist export (/[businessSlug]/discovery/offerings/[productId]/watchlist).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import { getWatchlistDashboardRows } from "../../lib/watchlist/queries";
import type { WatchlistEntryWithProspect } from "../../lib/watchlist/types";
import { BASIS, readProductId, resolveOffering } from "./shared";

/**
 * The accounts on the offering's watchlist, as the page lists them (its own
 * `getWatchlistDashboardRows`): why each is watched, when it is next due for review, its
 * current fit score and its most recent signal. Watchlist entries have no status or alert
 * state of their own -- an entry is either on the list or not -- so "Review due" (the next
 * review date has passed) is the only alert-like fact exported.
 */
export const discoveryWatchlistExport: ExportAdapter<{ productId: string }> = {
  id: "discovery.watchlist",
  module: "discovery",
  permissions: [],
  parseFilters: (params) => ({ productId: readProductId(params) }),
  describeFilters: (f) => ({ Offering: f.productId }),
  async load(context, filters) {
    const { product, workspace } = await resolveOffering(context, filters.productId);
    const rows = await getWatchlistDashboardRows(workspace.id);
    const now = Date.now();

    return {
      module: "discovery",
      resource: "watchlist",
      title: "Discovery watchlist",
      metadata: { Offering: product.name },
      sheets: [
        {
          sheetName: "Watchlist",
          columns: [
            { key: "prospect", header: "Prospect", getValue: (r: WatchlistEntryWithProspect) => r.prospectCompanyName },
            { key: "industry", header: "Industry", getValue: (r: WatchlistEntryWithProspect) => r.prospectIndustry },
            { key: "reason", header: "Watch reason", getValue: (r: WatchlistEntryWithProspect) => r.watch_reason },
            { key: "next_review", header: "Next review", type: "datetime", getValue: (r: WatchlistEntryWithProspect) => r.next_review_at },
            {
              key: "review_due",
              header: "Review due",
              type: "boolean",
              getValue: (r: WatchlistEntryWithProspect) => (r.next_review_at ? new Date(r.next_review_at).getTime() <= now : null),
            },
            { key: "score", header: "Current fit score", type: "integer", getValue: (r: WatchlistEntryWithProspect) => r.currentScore },
            { key: "score_basis", header: "Fit score basis", getValue: (r: WatchlistEntryWithProspect) => (r.currentScore === null ? null : BASIS.fitScore) },
            { key: "last_signal", header: "Last signal", getValue: (r: WatchlistEntryWithProspect) => r.lastSignalDescription },
            { key: "last_signal_at", header: "Last signal date", type: "datetime", getValue: (r: WatchlistEntryWithProspect) => r.lastSignalAt },
            { key: "added", header: "Added", type: "datetime", getValue: (r: WatchlistEntryWithProspect) => r.created_at },
            { key: "updated", header: "Updated", type: "datetime", getValue: (r: WatchlistEntryWithProspect) => r.updated_at },
          ],
          rows,
        },
      ],
    };
  },
};
