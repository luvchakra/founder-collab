/**
 * MKT-03/MKT-16. The attention panel's rules are deterministic, carry their evidence, and
 * never judge performance from data that was not reported.
 */
import { describe, expect, it } from "vitest";
import { marketingAttention } from "./attention";
import type { CampaignMetricRow, MarketingCampaign, MarketingContent } from "./types";

const NOW = new Date("2026-09-25T10:00:00Z");

function campaign(over: Partial<MarketingCampaign> = {}): MarketingCampaign {
  return {
    id: "c1",
    businessId: "b1",
    offeringId: null,
    offeringName: null,
    icpProfileId: null,
    name: "Awareness push",
    description: null,
    objective: "awareness",
    channel: "linkedin",
    budget: null,
    currency: null,
    startAt: "2026-09-01",
    endAt: null,
    landingPageUrl: null,
    message: null,
    cta: null,
    utm: {},
    status: "active",
    notes: null,
    createdAt: "2026-09-01",
    updatedAt: "2026-09-01",
    ...over,
  };
}

function metric(over: Partial<CampaignMetricRow> = {}): CampaignMetricRow {
  return {
    campaignId: "c1",
    metricDate: "2026-09-20",
    source: "manual",
    impressions: null,
    clicks: null,
    sessions: null,
    engagements: null,
    leads: null,
    qualifiedLeads: null,
    opportunities: null,
    customers: null,
    revenue: null,
    spend: null,
    currency: null,
    ...over,
  };
}

function content(over: Partial<MarketingContent> = {}): MarketingContent {
  return {
    id: "x1",
    businessId: "b1",
    offeringId: null,
    campaignId: null,
    campaignName: null,
    title: "Top tips",
    contentType: "blog",
    brief: null,
    body: null,
    summary: null,
    audience: null,
    channel: null,
    cta: null,
    status: "draft",
    scheduledAt: null,
    publishedAt: null,
    approvedAt: null,
    publishedVersionId: null,
    externalUrl: null,
    seoMetadata: {},
    updatedAt: "2026-09-20",
    ...over,
  };
}

const keys = (items: { key: string }[]) => items.map((i) => i.key);

describe("marketingAttention", () => {
  it("says results are unknown, rather than judging, when no snapshot exists", () => {
    const items = marketingAttention({ campaigns: [campaign()], metrics: [], content: [], now: NOW });
    expect(keys(items)).toEqual(["nometrics:c1"]);
  });

  it("flags over-budget spend only when currencies agree", () => {
    const over = marketingAttention({
      campaigns: [campaign({ budget: 1000, currency: "INR" })],
      metrics: [metric({ spend: 1200, currency: "INR" })],
      content: [],
      now: NOW,
    });
    expect(keys(over)).toContain("overbudget:c1");
    expect(over[0]!.severity).toBe("high");

    const mixed = marketingAttention({
      campaigns: [campaign({ budget: 1000, currency: "INR" })],
      metrics: [metric({ spend: 1200, currency: "USD" })],
      content: [],
      now: NOW,
    });
    expect(keys(mixed)).not.toContain("overbudget:c1");
  });

  it("flags a campaign ending within a week and one past its end", () => {
    const soon = marketingAttention({
      campaigns: [campaign({ endAt: "2026-09-28T00:00:00Z" })],
      metrics: [metric({ leads: 3 })],
      content: [],
      now: NOW,
    });
    expect(keys(soon)).toContain("ending:c1");

    const past = marketingAttention({
      campaigns: [campaign({ endAt: "2026-09-01T00:00:00Z" })],
      metrics: [metric({ leads: 3 })],
      content: [],
      now: NOW,
    });
    expect(keys(past)).toContain("ended:c1");
  });

  it("flags a missing landing page only for traffic-style campaigns", () => {
    const lead = marketingAttention({
      campaigns: [campaign({ objective: "lead_generation" })],
      metrics: [metric({ leads: 1 })],
      content: [],
      now: NOW,
    });
    expect(keys(lead)).toContain("landing:c1");
    const awareness = marketingAttention({ campaigns: [campaign()], metrics: [metric({ leads: 1 })], content: [], now: NOW });
    expect(keys(awareness)).not.toContain("landing:c1");
  });

  it("reports weak conversion only on reported zero leads, not on unreported leads", () => {
    const zero = marketingAttention({
      campaigns: [campaign()],
      metrics: [metric({ sessions: 500, leads: 0 })],
      content: [],
      now: NOW,
    });
    expect(keys(zero)).toContain("noconvert:c1");
    const unreported = marketingAttention({
      campaigns: [campaign()],
      metrics: [metric({ sessions: 500 })],
      content: [],
      now: NOW,
    });
    expect(keys(unreported)).not.toContain("noconvert:c1");
  });

  it("ignores campaigns that are not active", () => {
    expect(marketingAttention({ campaigns: [campaign({ status: "draft" })], metrics: [], content: [], now: NOW })).toEqual([]);
  });

  it("surfaces content awaiting approval and overdue scheduled content, most severe first", () => {
    const items = marketingAttention({
      campaigns: [],
      metrics: [],
      content: [
        content({ id: "a", status: "review" }),
        content({ id: "b", status: "scheduled", scheduledAt: "2026-09-20T09:00:00Z" }),
      ],
      now: NOW,
    });
    expect(keys(items)).toEqual(["content-overdue", "content-review"]);
  });
});
