// EXP-MKT-07 -- Marketing analytics export (/discovery/marketing/analytics).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import type { ExportColumn } from "@cofounderai/core/exports/types";
import { listOfferingOptions } from "../../lib/marketing/queries";
import { marketingFunnel, type FunnelStage } from "../../lib/marketing/metrics";
import { campaignReport, channelReport, offeringReport, timeSeries, type ReportRow, type SeriesPoint } from "../../lib/marketing/analytics";
import { MARKETING_PERIOD_LABEL, parsePeriod, periodWindow, type MarketingPeriod } from "../../lib/marketing/period";
import { MARKETING_CHANNELS, MARKETING_CHANNEL_LABEL, type MarketingChannel } from "../../lib/marketing/types";
import { listCampaignMetricsForExport, listCampaignsForExport } from "./queries";
import { idParam, totalsColumns } from "./shared";

type Report = "campaign" | "channel" | "offering";
type Filters = { period: MarketingPeriod; report: Report; grain: "day" | "week" | "month"; channel: MarketingChannel | "all"; offeringId?: string };

const REPORT_LABEL: Record<Report, string> = { campaign: "By campaign", channel: "By channel", offering: "By offering" };
const GRAIN_LABEL: Record<Filters["grain"], string> = { day: "Daily", week: "Weekly", month: "Monthly" };

/**
 * The active report (campaign, channel or offering) with every metric the page shows --
 * including the cost ratios, blank whenever spend or the count was not reported or the
 * snapshots mix currencies -- plus the funnel and the time series at the chosen grain.
 * The period, report and filters travel in the workbook metadata.
 */
export const marketingAnalyticsExport: ExportAdapter<Filters> = {
  id: "marketing.analytics",
  module: "discovery",
  permissions: ["marketing.view"],
  parseFilters: (params) => {
    const report = params.get("report");
    const grain = params.get("grain");
    const channel = params.get("channel");
    return {
      period: parsePeriod(params.get("period") ?? undefined),
      report: report === "channel" || report === "offering" ? report : "campaign",
      grain: grain === "day" || grain === "month" ? grain : "week",
      channel: (MARKETING_CHANNELS as readonly string[]).includes(channel ?? "") ? (channel as MarketingChannel) : "all",
      offeringId: idParam(params, "offering"),
    };
  },
  describeFilters: (f) => ({
    Period: MARKETING_PERIOD_LABEL[f.period],
    Report: REPORT_LABEL[f.report],
    "Time series": GRAIN_LABEL[f.grain],
    Channel: f.channel === "all" ? "" : MARKETING_CHANNEL_LABEL[f.channel],
    Offering: f.offeringId ?? "",
  }),
  async load(context, filters) {
    const window = periodWindow(filters.period);
    const [campaigns, offerings] = await Promise.all([
      listCampaignsForExport(context.businessId, { status: "all", channel: filters.channel, offeringId: filters.offeringId }),
      listOfferingOptions(context.businessId),
    ]);
    const metrics = await listCampaignMetricsForExport(
      context.businessId,
      window,
      campaigns.map((c) => c.id),
    );
    const rows =
      filters.report === "channel"
        ? channelReport(campaigns, metrics, (c) => MARKETING_CHANNEL_LABEL[c])
        : filters.report === "offering"
          ? offeringReport(campaigns, metrics)
          : campaignReport(campaigns, metrics);

    const reportColumns: ExportColumn<ReportRow>[] = [
      { key: "label", header: filters.report === "campaign" ? "Campaign" : filters.report === "channel" ? "Channel" : "Offering", getValue: (r) => r.label },
      ...(filters.report !== "campaign"
        ? [{ key: "campaigns", header: "Campaigns", type: "integer" as const, getValue: (r: ReportRow) => r.campaignCount }]
        : []),
      ...totalsColumns<ReportRow>((r) => r.totals, {
        fields: ["spend", "impressions", "clicks", "leads", "qualifiedLeads", "opportunities", "customers", "revenue", "costPerLead", "costPerQualifiedLead", "costPerOpportunity"],
      }),
    ];
    const funnelColumns: ExportColumn<FunnelStage>[] = [
      { key: "stage", header: "Stage", getValue: (s) => s.label },
      { key: "count", header: "Count", type: "integer", getValue: (s) => s.count },
      { key: "conversion", header: "Conversion from previous stage", type: "percent", getValue: (s) => s.conversionFromPrevious },
    ];
    const seriesColumns: ExportColumn<SeriesPoint>[] = [
      {
        key: "bucket",
        header: filters.grain === "day" ? "Day" : filters.grain === "week" ? "Week of" : "Month",
        getValue: (p) => (filters.grain === "month" ? p.bucket.slice(0, 7) : p.bucket),
        type: filters.grain === "month" ? "text" : "date",
      },
      { key: "sessions", header: "Traffic (sessions)", type: "integer", getValue: (p) => p.sessions },
      { key: "leads", header: "Leads", type: "integer", getValue: (p) => p.leads },
      { key: "qualified", header: "Qualified leads", type: "integer", getValue: (p) => p.qualifiedLeads },
      { key: "opportunities", header: "Opportunities", type: "integer", getValue: (p) => p.opportunities },
      { key: "customers", header: "Customers", type: "integer", getValue: (p) => p.customers },
    ];

    const offeringName = filters.offeringId ? (offerings.find((o) => o.id === filters.offeringId)?.name ?? "Selected offering") : "All offerings";
    return {
      module: "discovery",
      resource: "marketing-analytics",
      title: `Marketing analytics — ${REPORT_LABEL[filters.report].toLowerCase()}`,
      metadata: {
        Period: `${MARKETING_PERIOD_LABEL[filters.period]} (${window.from} to ${window.to})`,
        Report: REPORT_LABEL[filters.report],
        Channel: filters.channel === "all" ? "All channels" : MARKETING_CHANNEL_LABEL[filters.channel],
        Offering: offeringName,
        "Time series": GRAIN_LABEL[filters.grain],
        "Recorded snapshots": String(metrics.length),
      },
      sheets: [
        { sheetName: REPORT_LABEL[filters.report], columns: reportColumns, rows },
        { sheetName: "Funnel", columns: funnelColumns, rows: metrics.length > 0 ? marketingFunnel(metrics) : [] },
        { sheetName: "Over time", columns: seriesColumns, rows: timeSeries(metrics, filters.grain) },
      ],
    };
  },
};
