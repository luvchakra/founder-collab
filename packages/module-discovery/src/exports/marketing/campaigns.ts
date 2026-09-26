// EXP-MKT-03 -- Campaign list export (/discovery/marketing/campaigns).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import type { ExportColumn } from "@cofounderai/core/exports/types";
import type { CampaignFilters } from "../../lib/marketing/queries";
import { campaignTotals, type CampaignTotals } from "../../lib/marketing/metrics";
import { parsePeriod, periodWindow } from "../../lib/marketing/period";
import {
  CAMPAIGN_OBJECTIVE_LABEL,
  CAMPAIGN_STATUSES,
  CAMPAIGN_STATUS_LABEL,
  MARKETING_CHANNELS,
  MARKETING_CHANNEL_LABEL,
  type CampaignMetricRow,
  type CampaignStatus,
  type MarketingCampaign,
  type MarketingChannel,
} from "../../lib/marketing/types";
import { listCampaignMetricsForExport, listCampaignsForExport } from "./queries";
import { idParam, totalsColumns } from "./shared";

type Filters = Required<Pick<CampaignFilters, "status" | "channel" | "sort">> & { offeringId?: string };

const SORT_LABEL: Record<Filters["sort"], string> = { newest: "Newest first", name: "Name", end_date: "Ending soonest" };

type Row = { campaign: MarketingCampaign; totals: CampaignTotals; lastActivity: string | null };

/** Parses the campaign-list filters exactly as the page does -- an unknown value falls
 * back to the page's default rather than failing. */
export function parseCampaignListFilters(params: URLSearchParams): Filters {
  const status = params.get("status");
  const channel = params.get("channel");
  const sort = params.get("sort");
  return {
    status: (CAMPAIGN_STATUSES as readonly string[]).includes(status ?? "") ? (status as CampaignStatus) : "all",
    channel: (MARKETING_CHANNELS as readonly string[]).includes(channel ?? "") ? (channel as MarketingChannel) : "all",
    offeringId: idParam(params, "offering"),
    sort: sort === "name" || sort === "end_date" ? sort : "newest",
  };
}

/**
 * Every campaign matching the list's filters, in its sort order, with the performance
 * columns the list shows. Like the page, the figures cover the last 12 months of
 * recorded results -- stated in the workbook, not implied -- and a figure nobody
 * reported is blank, never 0 (§46).
 */
export const marketingCampaignsExport: ExportAdapter<Filters> = {
  id: "marketing.campaigns",
  module: "discovery",
  permissions: ["marketing.view"],
  parseFilters: parseCampaignListFilters,
  describeFilters: (f) => ({
    Status: f.status === "all" ? "" : CAMPAIGN_STATUS_LABEL[f.status],
    Channel: f.channel === "all" ? "" : MARKETING_CHANNEL_LABEL[f.channel],
    Offering: f.offeringId ?? "",
    Sort: f.sort === "newest" ? "" : SORT_LABEL[f.sort],
  }),
  async load(context, filters) {
    const campaigns = await listCampaignsForExport(context.businessId, filters);
    const window = periodWindow(parsePeriod("365d"));
    const metrics = await listCampaignMetricsForExport(
      context.businessId,
      window,
      campaigns.map((c) => c.id),
    );
    const byCampaign = new Map<string, CampaignMetricRow[]>();
    const last = new Map<string, string>();
    for (const m of metrics) {
      byCampaign.set(m.campaignId, [...(byCampaign.get(m.campaignId) ?? []), m]);
      if ((last.get(m.campaignId) ?? "") < m.metricDate) last.set(m.campaignId, m.metricDate);
    }
    const rows: Row[] = campaigns.map((c) => ({
      campaign: c,
      totals: campaignTotals(byCampaign.get(c.id) ?? []),
      lastActivity: last.get(c.id) ?? null,
    }));

    const columns: ExportColumn<Row>[] = [
      { key: "campaign", header: "Campaign", getValue: (r) => r.campaign.name },
      { key: "status", header: "Status", getValue: (r) => CAMPAIGN_STATUS_LABEL[r.campaign.status] ?? r.campaign.status },
      { key: "objective", header: "Objective", getValue: (r) => CAMPAIGN_OBJECTIVE_LABEL[r.campaign.objective] ?? r.campaign.objective },
      { key: "offering", header: "Offering", getValue: (r) => r.campaign.offeringName ?? "Company-wide" },
      { key: "channel", header: "Channel", getValue: (r) => MARKETING_CHANNEL_LABEL[r.campaign.channel] ?? r.campaign.channel },
      { key: "budget", header: "Budget", type: "currency", getValue: (r) => r.campaign.budget },
      { key: "budgetCurrency", header: "Budget currency", getValue: (r) => (r.campaign.budget !== null ? r.campaign.currency : null) },
      { key: "start", header: "Start", type: "date", getValue: (r) => r.campaign.startAt },
      { key: "end", header: "End", type: "date", getValue: (r) => r.campaign.endAt },
      ...totalsColumns<Row>((r) => r.totals, {
        fields: ["spend", "leads", "qualifiedLeads", "opportunities", "customers", "revenue", "leadToCustomer"],
        fallbackCurrency: (r) => r.campaign.currency,
      }),
      { key: "lastActivity", header: "Last recorded result", type: "date", getValue: (r) => r.lastActivity },
      { key: "landingPage", header: "Landing page", getValue: (r) => r.campaign.landingPageUrl },
      { key: "created", header: "Created", type: "datetime", getValue: (r) => r.campaign.createdAt },
    ];

    return {
      module: "discovery",
      resource: "marketing-campaigns",
      title: "Marketing campaigns",
      metadata: { "Results window": `Last 12 months (${window.from} to ${window.to})` },
      sheets: [{ sheetName: "Campaigns", columns, rows }],
    };
  },
};
