// EXP-MKT-05 -- Content export (/discovery/marketing/content, list and calendar views).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import type { ExportColumn } from "@cofounderai/core/exports/types";
import { listScheduledContent } from "../../lib/marketing/queries";
import { monthWindow } from "../../lib/marketing/period";
import {
  CONTENT_STATUSES,
  CONTENT_STATUS_LABEL,
  CONTENT_TYPES,
  CONTENT_TYPE_LABEL,
  type ContentStatus,
  type ContentType,
  type MarketingContent,
} from "../../lib/marketing/types";
import { listContentForExport, listNamesForExport } from "./queries";
import { idParam } from "./shared";

type Filters = {
  view: "list" | "calendar";
  status: ContentStatus | "all";
  contentType: ContentType | "all";
  campaignId?: string;
  month?: string;
};

/**
 * Content as the page lists it -- the list view's filters, or the calendar view's month
 * with the same filters applied the same way. The first sheet is metadata only (the CSV
 * never carries full rich text); the Excel workbook adds a "Full text"
 * sheet with each item's summary and body in their own controlled columns.
 */
export const marketingContentExport: ExportAdapter<Filters> = {
  id: "marketing.content",
  module: "discovery",
  permissions: ["marketing.view"],
  parseFilters: (params) => {
    const status = params.get("status");
    const type = params.get("type");
    const month = params.get("month");
    return {
      view: params.get("view") === "calendar" ? "calendar" : "list",
      status: (CONTENT_STATUSES as readonly string[]).includes(status ?? "") ? (status as ContentStatus) : "all",
      contentType: (CONTENT_TYPES as readonly string[]).includes(type ?? "") ? (type as ContentType) : "all",
      campaignId: idParam(params, "campaign"),
      month: month && /^\d{4}-\d{2}$/.test(month) ? month : undefined,
    };
  },
  describeFilters: (f) => ({
    View: f.view === "calendar" ? "Calendar" : "List",
    Status: f.status === "all" ? "" : CONTENT_STATUS_LABEL[f.status],
    Type: f.contentType === "all" ? "" : CONTENT_TYPE_LABEL[f.contentType],
    Campaign: f.campaignId ?? "",
    Month: f.view === "calendar" ? (f.month ?? "") : "",
  }),
  async load(context, filters) {
    let items: MarketingContent[];
    const metadata: Record<string, string> = {};
    if (filters.view === "calendar") {
      const win = monthWindow(filters.month);
      items = await listScheduledContent(context.businessId, { from: `${win.from}T00:00:00Z`, to: `${win.to}T23:59:59Z` });
      if (filters.status !== "all") items = items.filter((c) => c.status === filters.status);
      if (filters.contentType !== "all") items = items.filter((c) => c.contentType === filters.contentType);
      if (filters.campaignId) items = items.filter((c) => c.campaignId === filters.campaignId);
      metadata.Month = win.month;
    } else {
      items = await listContentForExport(context.businessId, {
        status: filters.status,
        contentType: filters.contentType,
        campaignId: filters.campaignId,
      });
    }
    const offerings = await listNamesForExport(context.businessId, "products");

    const columns: ExportColumn<MarketingContent>[] = [
      { key: "title", header: "Title", getValue: (c) => c.title },
      { key: "type", header: "Type", getValue: (c) => CONTENT_TYPE_LABEL[c.contentType] ?? c.contentType },
      { key: "status", header: "Status", getValue: (c) => CONTENT_STATUS_LABEL[c.status] ?? c.status },
      { key: "campaign", header: "Campaign", getValue: (c) => c.campaignName },
      { key: "offering", header: "Offering", getValue: (c) => (c.offeringId ? (offerings.get(c.offeringId) ?? null) : null) },
      { key: "channel", header: "Channel", getValue: (c) => c.channel },
      { key: "audience", header: "Audience", getValue: (c) => c.audience },
      { key: "scheduled", header: "Scheduled", type: "datetime", getValue: (c) => c.scheduledAt },
      { key: "approved", header: "Approved", type: "datetime", getValue: (c) => c.approvedAt },
      { key: "published", header: "Published", type: "datetime", getValue: (c) => c.publishedAt },
      { key: "updated", header: "Updated", type: "datetime", getValue: (c) => c.updatedAt },
      { key: "url", header: "Published URL", getValue: (c) => c.externalUrl },
    ];
    const fullTextColumns: ExportColumn<MarketingContent>[] = [
      { key: "title", header: "Title", getValue: (c) => c.title },
      { key: "summary", header: "Summary", getValue: (c) => c.summary },
      { key: "brief", header: "Brief", getValue: (c) => c.brief },
      { key: "body", header: "Body", getValue: (c) => c.body },
    ];

    return {
      module: "discovery",
      resource: "marketing-content",
      title: "Marketing content",
      metadata,
      sheets: [
        { sheetName: "Content", columns, rows: items },
        { sheetName: "Full text", columns: fullTextColumns, rows: items },
      ],
    };
  },
};
