// EXP-MKT-04 -- Campaign detail / performance export (/discovery/marketing/campaigns/[campaignId]).
import { ExportDeniedError, type ExportAdapter } from "@cofounderai/core/exports/server";
import type { ExportColumn } from "@cofounderai/core/exports/types";
import {
  getCampaign,
  listAttributions,
  listCampaignMetrics,
  listContent,
  listEntityActivity,
  type ActivityEntry,
  type AttributionRow,
} from "../../lib/marketing/queries";
import { campaignPacing, campaignTotals } from "../../lib/marketing/metrics";
import {
  ASSET_TYPE_LABEL,
  CAMPAIGN_OBJECTIVE_LABEL,
  CAMPAIGN_STATUS_LABEL,
  CONTENT_STATUS_LABEL,
  CONTENT_TYPE_LABEL,
  MARKETING_CHANNEL_LABEL,
  type CampaignMetricRow,
  type MarketingCampaign,
  type MarketingContent,
} from "../../lib/marketing/types";
import { listAssetsForExport, type AssetExportRow } from "./queries";
import { FIGURE_COLUMNS, idParam, METRIC_SOURCE_LABEL, totalsCurrency, totalsFigures } from "./shared";

type Filters = { campaignId?: string };

const TOUCH_LABEL: Record<AttributionRow["touchType"], string> = {
  first_touch: "First touch",
  last_touch: "Last touch",
  influenced: "Influenced",
};
const ATTRIBUTION_SOURCE_LABEL: Record<AttributionRow["source"], string> = {
  manual: "Recorded by a person",
  import: "Import",
  utm: "UTM tracking",
  inferred: "AI-inferred",
};
const ENTITY_LABEL: Record<AttributionRow["entityType"], string> = { prospect: "Prospect", opportunity: "Opportunity", customer: "Customer" };

/** The activity timeline's own wording: a status change reads "Status draft -> active",
 * anything else is the action's last segment, humanised. Only that description and the
 * time are exported -- never the raw before/after payload of the audit entry. */
export function describeActivity(entry: ActivityEntry): string {
  const from = entry.before?.status;
  const to = entry.after?.status;
  if (typeof from === "string" && typeof to === "string") return `Status ${from} -> ${to}`;
  const verb = entry.action.split(".").pop() ?? entry.action;
  return verb.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

type FieldRow = { field: string; value: unknown };

function planRows(c: MarketingCampaign, pacing: string | null): FieldRow[] {
  return [
    { field: "Campaign", value: c.name },
    { field: "Status", value: CAMPAIGN_STATUS_LABEL[c.status] ?? c.status },
    { field: "Objective", value: CAMPAIGN_OBJECTIVE_LABEL[c.objective] ?? c.objective },
    { field: "Channel", value: MARKETING_CHANNEL_LABEL[c.channel] ?? c.channel },
    { field: "Offering", value: c.offeringName ?? "Company-wide" },
    { field: "Start", value: c.startAt?.slice(0, 10) ?? null },
    { field: "End", value: c.endAt?.slice(0, 10) ?? null },
    { field: "Budget", value: c.budget },
    { field: "Budget currency", value: c.budget !== null ? c.currency : null },
    { field: "Pacing", value: pacing },
    { field: "Call to action", value: c.cta },
    { field: "Landing page", value: c.landingPageUrl },
    { field: "Tracking", value: Object.entries(c.utm).map(([k, v]) => `utm_${k}=${v}`) },
    { field: "Message", value: c.message },
    { field: "Description", value: c.description },
    { field: "Notes", value: c.notes },
    { field: "Created", value: c.createdAt },
    { field: "Updated", value: c.updatedAt },
  ];
}

/**
 * One campaign as a workbook: its plan, the result figures the page's tiles show, the
 * daily metric table exactly as rendered (newest first, blank = not reported), its
 * content, assets (metadata only), attributions and activity. The campaign id comes from
 * the request but is loaded only together with `context.businessId`, through RLS; a
 * campaign of another business is "not found", exactly as the page's 404.
 */
export const marketingCampaignExport: ExportAdapter<Filters> = {
  id: "marketing.campaign",
  module: "discovery",
  permissions: ["marketing.view"],
  parseFilters: (params) => ({ campaignId: idParam(params, "campaignId") }),
  describeFilters: (f) => ({ Campaign: f.campaignId ?? "" }),
  async load(context, filters) {
    const campaign = filters.campaignId ? await getCampaign(context.businessId, filters.campaignId) : null;
    if (!campaign) throw new ExportDeniedError("Campaign not found.", 404);

    const today = new Date().toISOString().slice(0, 10);
    const from = (campaign.startAt ?? campaign.createdAt).slice(0, 10);
    const [metrics, content, assets, activity, attributions] = await Promise.all([
      listCampaignMetrics(context.businessId, { from: from < today ? from : today, to: today }, [campaign.id]),
      listContent(context.businessId, { campaignId: campaign.id }),
      listAssetsForExport(context.businessId),
      listEntityActivity(context.businessId, "marketing_campaign", campaign.id),
      listAttributions(context.businessId, campaign.id),
    ]);
    const totals = campaignTotals(metrics);
    const currency = totals.currencies.length > 1 ? null : (totals.currencies[0] ?? campaign.currency);
    const pace = campaignPacing(campaign, totals, new Date());
    const pacing = pace
      ? `${(pace.spendShare * 100).toFixed(1)}% of budget used, ${(pace.timeShare * 100).toFixed(1)}% of the run elapsed (${pace.plannedDays} days planned)`
      : null;

    const fieldColumns: ExportColumn<FieldRow>[] = [
      { key: "field", header: "Field", getValue: (r) => r.field },
      { key: "value", header: "Value", getValue: (r) => r.value },
    ];
    const metricColumns: ExportColumn<CampaignMetricRow>[] = [
      { key: "date", header: "Date", type: "date", getValue: (m) => m.metricDate },
      { key: "source", header: "Source", getValue: (m) => METRIC_SOURCE_LABEL[m.source] ?? m.source },
      { key: "sessions", header: "Sessions", type: "integer", getValue: (m) => m.sessions },
      { key: "leads", header: "Leads", type: "integer", getValue: (m) => m.leads },
      { key: "qualified", header: "Qualified leads", type: "integer", getValue: (m) => m.qualifiedLeads },
      { key: "opportunities", header: "Opportunities", type: "integer", getValue: (m) => m.opportunities },
      { key: "customers", header: "Customers", type: "integer", getValue: (m) => m.customers },
      { key: "spend", header: "Spend", type: "currency", getValue: (m) => m.spend },
      { key: "revenue", header: "Revenue", type: "currency", getValue: (m) => m.revenue },
      { key: "currency", header: "Currency", getValue: (m) => m.currency },
    ];
    const contentColumns: ExportColumn<MarketingContent>[] = [
      { key: "title", header: "Title", getValue: (c) => c.title },
      { key: "type", header: "Type", getValue: (c) => CONTENT_TYPE_LABEL[c.contentType] ?? c.contentType },
      { key: "status", header: "Status", getValue: (c) => CONTENT_STATUS_LABEL[c.status] ?? c.status },
      { key: "scheduled", header: "Scheduled", type: "datetime", getValue: (c) => c.scheduledAt },
      { key: "published", header: "Published", type: "datetime", getValue: (c) => c.publishedAt },
      { key: "updated", header: "Updated", type: "datetime", getValue: (c) => c.updatedAt },
    ];
    const assetColumns: ExportColumn<AssetExportRow>[] = [
      { key: "asset", header: "Asset", getValue: (a) => a.name },
      { key: "type", header: "Type", getValue: (a) => ASSET_TYPE_LABEL[a.assetType] ?? a.assetType },
      { key: "file", header: "File name", getValue: (a) => a.fileName },
      { key: "mime", header: "MIME type", getValue: (a) => a.contentType },
      { key: "size", header: "Size (bytes)", type: "integer", getValue: (a) => a.sizeBytes },
      { key: "created", header: "Created", type: "datetime", getValue: (a) => a.createdAt },
    ];
    const attributionColumns: ExportColumn<AttributionRow>[] = [
      { key: "record", header: "Record", getValue: (a) => a.label },
      { key: "recordType", header: "Record type", getValue: (a) => ENTITY_LABEL[a.entityType] ?? a.entityType },
      { key: "touch", header: "Touch", getValue: (a) => TOUCH_LABEL[a.touchType] ?? a.touchType },
      { key: "source", header: "Attribution source", getValue: (a) => ATTRIBUTION_SOURCE_LABEL[a.source] ?? a.source },
      { key: "occurred", header: "Occurred", type: "datetime", getValue: (a) => a.occurredAt },
      { key: "evidence", header: "Evidence", getValue: (a) => a.evidenceNote },
    ];
    const activityColumns: ExportColumn<ActivityEntry>[] = [
      { key: "when", header: "When", type: "datetime", getValue: (e) => e.createdAt },
      { key: "activity", header: "Activity", getValue: describeActivity },
    ];

    return {
      module: "discovery",
      resource: "marketing-campaign",
      title: `Campaign: ${campaign.name}`,
      metadata: {
        Campaign: campaign.name,
        "Results window": `${from < today ? from : today} to ${today}`,
        ...(totals.currencies.length > 1
          ? { Note: `Results use more than one currency (${totalsCurrency(totals, null)}); money totals are left blank.` }
          : {}),
      },
      sheets: [
        { sheetName: "Campaign", columns: fieldColumns, rows: planRows(campaign, pacing) },
        { sheetName: "Results", columns: FIGURE_COLUMNS, rows: totalsFigures(totals, currency) },
        { sheetName: "Daily Metrics", columns: metricColumns, rows: [...metrics].reverse() },
        { sheetName: "Content", columns: contentColumns, rows: content },
        { sheetName: "Assets", columns: assetColumns, rows: assets.filter((a) => a.campaignId === campaign.id) },
        { sheetName: "Attributions", columns: attributionColumns, rows: attributions },
        { sheetName: "Activity", columns: activityColumns, rows: activity },
      ],
      // A CSV of a campaign is its daily metric table -- the one real table on the page.
      csvSheet: "Daily Metrics",
    };
  },
};
