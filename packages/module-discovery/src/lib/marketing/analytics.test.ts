/** MKT-14. Reports group snapshots without inventing numbers for groups that reported none. */
import { describe, expect, it } from "vitest";
import { channelReport, offeringReport, timeSeries } from "./analytics";
import type { CampaignMetricRow, MarketingCampaign } from "./types";

const base = {
  businessId: "b",
  icpProfileId: null,
  description: null,
  objective: "awareness",
  budget: null,
  currency: null,
  startAt: null,
  endAt: null,
  landingPageUrl: null,
  message: null,
  cta: null,
  utm: {},
  status: "active",
  notes: null,
  createdAt: "",
  updatedAt: "",
} as const;

const campaigns: MarketingCampaign[] = [
  { ...base, id: "a", name: "A", channel: "linkedin", offeringId: "o1", offeringName: "Alarms" },
  { ...base, id: "b", name: "B", channel: "linkedin", offeringId: null, offeringName: null },
  { ...base, id: "c", name: "C", channel: "email", offeringId: "o1", offeringName: "Alarms" },
];

function row(campaignId: string, metricDate: string, leads: number | null): CampaignMetricRow {
  return {
    campaignId,
    metricDate,
    source: "manual",
    impressions: null,
    clicks: null,
    sessions: null,
    engagements: null,
    leads,
    qualifiedLeads: null,
    opportunities: null,
    customers: null,
    revenue: null,
    spend: null,
    currency: null,
  };
}

describe("channelReport", () => {
  it("sums reported leads per channel and keeps an unreported channel null", () => {
    const report = channelReport(campaigns, [row("a", "2026-09-01", 3), row("b", "2026-09-02", 2)], (c) => c);
    const linkedin = report.find((r) => r.key === "linkedin")!;
    const email = report.find((r) => r.key === "email")!;
    expect(linkedin.totals.leads.value).toBe(5);
    expect(linkedin.campaignCount).toBe(2);
    expect(email.totals.leads.value).toBeNull();
  });
});

describe("offeringReport", () => {
  it("groups campaigns with no offering under one labelled row", () => {
    const report = offeringReport(campaigns, [row("c", "2026-09-01", 1)]);
    expect(report.map((r) => r.label)).toEqual(["Alarms", "No specific offering"]);
    expect(report[0]!.totals.leads.value).toBe(1);
  });
});

describe("timeSeries", () => {
  it("buckets by week in date order", () => {
    const series = timeSeries([row("a", "2026-09-25", 1), row("a", "2026-09-21", 2), row("a", "2026-09-14", null)], "week");
    expect(series.map((p) => [p.bucket, p.leads])).toEqual([
      ["2026-09-14", null],
      ["2026-09-21", 3],
    ]);
  });
});
