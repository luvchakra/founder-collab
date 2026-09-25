import { campaignTotals, sumReported, type CampaignTotals } from "./metrics";
import { bucketStart } from "./period";
import type { CampaignMetricRow, MarketingCampaign } from "./types";

/**
 * MKT-14 — Marketing analytics reports (§17.3). Pure grouping over metric snapshots; the
 * arithmetic (and its null-means-unreported rule) is `campaignTotals`', so a channel or
 * offering report can never compute a figure the campaign report would refuse to.
 */

export interface ReportRow {
  key: string;
  label: string;
  campaignCount: number;
  totals: CampaignTotals;
}

function groupBy(
  campaigns: MarketingCampaign[],
  rows: CampaignMetricRow[],
  keyOf: (c: MarketingCampaign) => { key: string; label: string },
): ReportRow[] {
  const groups = new Map<string, { label: string; campaignIds: Set<string> }>();
  const campaignKey = new Map<string, string>();
  for (const c of campaigns) {
    const { key, label } = keyOf(c);
    campaignKey.set(c.id, key);
    const group = groups.get(key) ?? { label, campaignIds: new Set<string>() };
    group.campaignIds.add(c.id);
    groups.set(key, group);
  }
  const rowsByKey = new Map<string, CampaignMetricRow[]>();
  for (const row of rows) {
    const key = campaignKey.get(row.campaignId);
    if (!key) continue;
    const list = rowsByKey.get(key) ?? [];
    list.push(row);
    rowsByKey.set(key, list);
  }
  return [...groups.entries()]
    .map(([key, g]) => ({
      key,
      label: g.label,
      campaignCount: g.campaignIds.size,
      totals: campaignTotals(rowsByKey.get(key) ?? []),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function campaignReport(campaigns: MarketingCampaign[], rows: CampaignMetricRow[]): ReportRow[] {
  return groupBy(campaigns, rows, (c) => ({ key: c.id, label: c.name }));
}

export function channelReport(
  campaigns: MarketingCampaign[],
  rows: CampaignMetricRow[],
  labelOf: (channel: MarketingCampaign["channel"]) => string,
): ReportRow[] {
  return groupBy(campaigns, rows, (c) => ({ key: c.channel, label: labelOf(c.channel) }));
}

export function offeringReport(campaigns: MarketingCampaign[], rows: CampaignMetricRow[]): ReportRow[] {
  return groupBy(campaigns, rows, (c) => ({
    key: c.offeringId ?? "none",
    label: c.offeringName ?? "No specific offering",
  }));
}

export interface SeriesPoint {
  bucket: string;
  sessions: number | null;
  leads: number | null;
  qualifiedLeads: number | null;
  opportunities: number | null;
  customers: number | null;
}

/** Counts per day/week/month. A bucket with no reported value for a field stays null. */
export function timeSeries(rows: CampaignMetricRow[], grain: "day" | "week" | "month"): SeriesPoint[] {
  const buckets = new Map<string, CampaignMetricRow[]>();
  for (const row of rows) {
    const b = bucketStart(row.metricDate, grain);
    const list = buckets.get(b) ?? [];
    list.push(row);
    buckets.set(b, list);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, list]) => ({
      bucket,
      sessions: sumReported(list, "sessions"),
      leads: sumReported(list, "leads"),
      qualifiedLeads: sumReported(list, "qualifiedLeads"),
      opportunities: sumReported(list, "opportunities"),
      customers: sumReported(list, "customers"),
    }));
}
