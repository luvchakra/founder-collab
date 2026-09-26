// EXP-CRM-04 -- CRM Analytics export (/crm/analytics): every section of the page as
// numbers, one sheet per dataset.
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import type { ExportSheet } from "@cofounderai/core/exports/types";
import { getChannelPerformance } from "../lib/dashboard/channel-performance";
import { getDiscoveryCrmFunnel } from "../lib/dashboard/discovery-funnel";
import { getCrmFsmFunnel } from "../lib/dashboard/fsm-funnel";
import { getResponsePerformance } from "../lib/dashboard/response-performance";
import type { ChannelPerformanceRow } from "../lib/dashboard/types";
import { SOURCE_CHANNEL_LABEL, labelOf } from "./labels";
import { channelResponseSheet, metricSheet, ownerPerformanceSheet, responseMetricRows } from "./sheets";

type FunnelRow = { stage: string; count: number | null; amount: number | null; source: string };

function funnelSheet(sheetName: string, rows: FunnelRow[]): ExportSheet<FunnelRow> {
  return {
    sheetName,
    columns: [
      { key: "stage", header: "Stage", getValue: (r) => r.stage },
      { key: "count", header: "Count", type: "integer", getValue: (r) => r.count },
      { key: "amount", header: "Amount (INR)", type: "currency", currency: "INR", getValue: (r) => r.amount },
      { key: "source", header: "Source", getValue: (r) => r.source },
    ],
    rows,
  };
}

/**
 * The Discovery and FSM funnels come through those modules' contracts; when a module
 * isn't licensed (ADR-10) the page hides the section, and this export keeps its rows
 * with blank figures and a Source that says why -- never zeros that would read as
 * "nothing happened".
 */
export const crmAnalyticsExport: ExportAdapter<Record<string, never>> = {
  id: "crm.analytics",
  module: "crm",
  permissions: ["analytics.view"],
  parseFilters: () => ({}),
  async load(context) {
    const businessId = context.businessId;
    const [performance, discovery, fsm, channels] = await Promise.all([
      getResponsePerformance(businessId),
      getDiscoveryCrmFunnel(businessId),
      getCrmFsmFunnel(businessId),
      getChannelPerformance(businessId),
    ]);

    const discoveryUnavailable = "Discovery unavailable";
    const discoveryRows: FunnelRow[] = (
      [
        ["Discovered", discovery?.discovered, "Discovery"],
        ["Contacted", discovery?.contacted, "Discovery"],
        ["Engaged", discovery?.engaged, "Discovery"],
        ["Qualified", discovery?.qualified, "Discovery"],
        ["Opportunity", discovery?.opportunity, "CRM"],
        ["Won", discovery?.won, "CRM"],
      ] as const
    ).map(([stage, count, source]) => ({
      stage,
      count: discovery ? (count ?? null) : null,
      amount: null,
      source: discovery ? source : discoveryUnavailable,
    }));

    const fsmUnavailable = "FSM unavailable";
    const fsmRows: FunnelRow[] = [
      { stage: "Opportunity", count: fsm?.opportunity ?? null, amount: null, source: fsm ? "CRM" : fsmUnavailable },
      { stage: "Quote", count: fsm?.quote ?? null, amount: null, source: fsm ? "CRM" : fsmUnavailable },
      { stage: "Accepted", count: fsm?.accepted ?? null, amount: null, source: fsm ? "FSM" : fsmUnavailable },
      { stage: "Job", count: fsm?.job ?? null, amount: null, source: fsm ? "FSM" : fsmUnavailable },
      { stage: "Completed", count: fsm?.completed ?? null, amount: null, source: fsm ? "FSM" : fsmUnavailable },
      { stage: "Revenue", count: null, amount: fsm?.revenue ?? null, source: fsm ? "FSM" : fsmUnavailable },
    ];

    const channelSheet: ExportSheet<ChannelPerformanceRow> = {
      sheetName: "Channel Performance",
      columns: [
        { key: "channel", header: "Channel", getValue: (r) => labelOf(SOURCE_CHANNEL_LABEL, r.channel) },
        { key: "responded", header: "Responded", type: "integer", getValue: (r) => r.responded },
        { key: "qualified", header: "Qualified leads", type: "integer", getValue: (r) => r.qualifiedLeads },
        { key: "opportunities", header: "Opportunities", type: "integer", getValue: (r) => r.opportunities },
        { key: "wins", header: "Wins", type: "integer", getValue: (r) => r.wins },
        { key: "revenue", header: "Revenue (won value)", type: "currency", currency: "INR", getValue: (r) => r.revenue },
      ],
      rows: channels,
    };

    return {
      module: "crm",
      resource: "analytics",
      title: "CRM analytics",
      metadata: { Period: "Response performance: last 30 days" },
      sheets: [
        metricSheet("Response Performance", responseMetricRows(performance)),
        ownerPerformanceSheet(performance.ownerPerformance),
        channelResponseSheet(performance.channelResponseTime),
        funnelSheet("Discovery Funnel", discoveryRows),
        funnelSheet("FSM Funnel", fsmRows),
        channelSheet,
      ],
    };
  },
};
