// EXP-MKT-01 -- Marketing dashboard export (/discovery/marketing).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import type { ExportColumn } from "@cofounderai/core/exports/types";
import { listOfferingOptions } from "../../lib/marketing/queries";
import { campaignTotals, marketingFunnel, type CampaignTotals, type FunnelStage, type Metric } from "../../lib/marketing/metrics";
import { marketingAttention, type AttentionItem } from "../../lib/marketing/attention";
import { MARKETING_PERIOD_LABEL, parsePeriod, periodWindow, type MarketingPeriod } from "../../lib/marketing/period";
import {
  CAMPAIGN_OBJECTIVE_LABEL,
  CAMPAIGN_STATUS_LABEL,
  MARKETING_CHANNEL_LABEL,
  type CampaignMetricRow,
  type MarketingCampaign,
} from "../../lib/marketing/types";
import { listCampaignMetricsForExport, listCampaignsForExport, listContentForExport } from "./queries";
import { FIGURE_COLUMNS, figureRow, idParam, totalsColumns, totalsFigures, type FigureRow } from "./shared";

type Filters = { period: MarketingPeriod; offeringId?: string };

const SEVERITY_LABEL: Record<AttentionItem["severity"], string> = { high: "High", medium: "Medium", low: "Low" };

type CampaignRow = { campaign: MarketingCampaign; totals: CampaignTotals; lastActivity: string | null };

/**
 * The dashboard's underlying numbers, never a picture of it (§6, §33): the key figures
 * with their definitions, every campaign's performance in the window (the page shows the
 * first 20 and links to the rest), the funnel, and the attention list. Same window, same
 * offering filter, same arithmetic (`campaignTotals`, `marketingFunnel`,
 * `marketingAttention`) as the page, so the file and the screen can't disagree.
 */
export const marketingDashboardExport: ExportAdapter<Filters> = {
  id: "marketing.dashboard",
  module: "discovery",
  permissions: ["marketing.view"],
  parseFilters: (params) => ({ period: parsePeriod(params.get("period") ?? undefined), offeringId: idParam(params, "offering") }),
  describeFilters: (f) => ({ Period: MARKETING_PERIOD_LABEL[f.period], Offering: f.offeringId ?? "" }),
  async load(context, filters) {
    const window = periodWindow(filters.period);
    const [campaigns, content, offerings] = await Promise.all([
      listCampaignsForExport(context.businessId, { offeringId: filters.offeringId }),
      listContentForExport(context.businessId),
      listOfferingOptions(context.businessId),
    ]);
    const metrics = await listCampaignMetricsForExport(
      context.businessId,
      window,
      campaigns.map((c) => c.id),
    );

    const totals = campaignTotals(metrics);
    const currency = totals.currencies.length > 1 ? null : (totals.currencies[0] ?? campaigns.find((c) => c.currency)?.currency ?? null);
    const scopedContent = filters.offeringId ? content.filter((c) => c.offeringId === filters.offeringId) : content;
    const attention = marketingAttention({ campaigns, metrics, content: scopedContent });
    const count = (value: number, definition: string): Metric => ({ value, definition });

    const summary: FigureRow[] = [
      figureRow("Active campaigns", count(campaigns.filter((c) => c.status === "active").length, "Campaigns whose status is Active."), "Count"),
      ...totalsFigures(totals, currency),
      figureRow(
        "Content in progress",
        count(
          scopedContent.filter((c) => ["idea", "draft", "review", "approved", "scheduled"].includes(c.status)).length,
          "Content items not yet published or archived.",
        ),
        "Count",
      ),
      figureRow("Published content", count(scopedContent.filter((c) => c.status === "published").length, "Content items marked Published by a person."), "Count"),
    ];

    const byCampaign = new Map<string, CampaignMetricRow[]>();
    const lastActivity = new Map<string, string>();
    for (const m of metrics) {
      byCampaign.set(m.campaignId, [...(byCampaign.get(m.campaignId) ?? []), m]);
      if ((lastActivity.get(m.campaignId) ?? "") < m.metricDate) lastActivity.set(m.campaignId, m.metricDate);
    }
    const campaignRows: CampaignRow[] = campaigns.map((c) => ({
      campaign: c,
      totals: campaignTotals(byCampaign.get(c.id) ?? []),
      lastActivity: lastActivity.get(c.id) ?? null,
    }));

    const campaignColumns: ExportColumn<CampaignRow>[] = [
      { key: "campaign", header: "Campaign", getValue: (r) => r.campaign.name },
      { key: "offering", header: "Offering", getValue: (r) => r.campaign.offeringName ?? "Company-wide" },
      { key: "channel", header: "Channel", getValue: (r) => MARKETING_CHANNEL_LABEL[r.campaign.channel] ?? r.campaign.channel },
      { key: "objective", header: "Objective", getValue: (r) => CAMPAIGN_OBJECTIVE_LABEL[r.campaign.objective] ?? r.campaign.objective },
      { key: "status", header: "Status", getValue: (r) => CAMPAIGN_STATUS_LABEL[r.campaign.status] ?? r.campaign.status },
      ...totalsColumns<CampaignRow>((r) => r.totals, {
        fields: ["spend", "leads", "qualifiedLeads", "opportunities", "customers", "revenue", "leadToCustomer"],
        fallbackCurrency: (r) => r.campaign.currency,
      }),
      { key: "lastActivity", header: "Last activity", type: "date", getValue: (r) => r.lastActivity },
    ];

    const funnelColumns: ExportColumn<FunnelStage>[] = [
      { key: "stage", header: "Stage", getValue: (s) => s.label },
      { key: "count", header: "Count", type: "integer", getValue: (s) => s.count },
      { key: "conversion", header: "Conversion from previous stage", type: "percent", getValue: (s) => s.conversionFromPrevious },
    ];

    const attentionColumns: ExportColumn<AttentionItem>[] = [
      { key: "severity", header: "Severity", getValue: (a) => SEVERITY_LABEL[a.severity] },
      { key: "title", header: "Item", getValue: (a) => a.title },
      { key: "reason", header: "Reason", getValue: (a) => a.reason },
      { key: "data", header: "Underlying data", getValue: (a) => a.data },
      { key: "action", header: "Suggested action", getValue: (a) => a.action },
      { key: "source", header: "Source", getValue: (a) => a.source },
      { key: "origin", header: "How it was produced", getValue: (a) => (a.origin === "ai" ? "AI-inferred" : "Rule-based") },
    ];

    const offeringName = filters.offeringId ? (offerings.find((o) => o.id === filters.offeringId)?.name ?? "Selected offering") : "All offerings";
    return {
      module: "discovery",
      resource: "marketing-dashboard",
      title: "Marketing dashboard",
      csvSheet: "Campaigns",
      metadata: {
        Period: `${MARKETING_PERIOD_LABEL[filters.period]} (${window.from} to ${window.to})`,
        Offering: offeringName,
        ...(totals.currencies.length > 1
          ? { Note: `Results were recorded in more than one currency (${totals.currencies.join(", ")}); money totals are left blank rather than added together.` }
          : {}),
      },
      sheets: [
        { sheetName: "Summary", columns: FIGURE_COLUMNS, rows: summary },
        { sheetName: "Campaigns", columns: campaignColumns, rows: campaignRows },
        { sheetName: "Funnel", columns: funnelColumns, rows: marketingFunnel(metrics) },
        { sheetName: "Attention", columns: attentionColumns, rows: attention },
      ],
    };
  },
};
