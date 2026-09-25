/**
 * MKT-03/MKT-14. The rule under test is the spec's hardest one to keep: a number nobody
 * reported is "unavailable", never zero, and a ratio with nothing to divide by is not a
 * ratio. Each test below is one way that rule could quietly break.
 */
import { describe, expect, it } from "vitest";
import { campaignPacing, campaignTotals, formatMetric, marketingFunnel, ratio, sumReported } from "./metrics";
import type { CampaignMetricRow } from "./types";

function row(overrides: Partial<CampaignMetricRow>): CampaignMetricRow {
  return {
    campaignId: "c1",
    metricDate: "2026-09-01",
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
    ...overrides,
  };
}

describe("sumReported", () => {
  it("is null when no snapshot reported the field — not zero", () => {
    expect(sumReported([row({}), row({})], "leads")).toBeNull();
  });

  it("is null for no snapshots at all", () => {
    expect(sumReported([], "spend")).toBeNull();
  });

  it("keeps a reported zero as zero, distinct from unreported", () => {
    expect(sumReported([row({ leads: 0 })], "leads")).toBe(0);
  });

  it("sums the rows that reported, ignoring the silent ones", () => {
    expect(sumReported([row({ leads: 3 }), row({}), row({ leads: 4 })], "leads")).toBe(7);
  });

  it("rounds money to paise so float noise never reaches the screen", () => {
    expect(sumReported([row({ spend: 0.1, currency: "INR" }), row({ spend: 0.2, currency: "INR" })], "spend")).toBe(0.3);
  });
});

describe("ratio", () => {
  it("divides when both sides are reported and the denominator is positive", () => {
    expect(ratio(500, 10)).toBe(50);
  });

  it.each([
    ["missing numerator", null, 10],
    ["missing denominator", 500, null],
    ["zero denominator", 500, 0],
  ])("is null for a %s", (_label, n, d) => {
    expect(ratio(n, d)).toBeNull();
  });
});

describe("campaignTotals", () => {
  it("computes cost per lead from reported spend and leads", () => {
    const t = campaignTotals([row({ spend: 1000, currency: "INR", leads: 20 })]);
    expect(t.costPerLead.value).toBe(50);
    expect(t.costPerLead.definition).toMatch(/spend ÷ reported leads/i);
  });

  // The exact case the spec calls out: CPL with no leads is "—", not 0 and not infinity.
  it("leaves cost per lead unavailable when no leads were reported", () => {
    const t = campaignTotals([row({ spend: 1000, currency: "INR" })]);
    expect(t.spend.value).toBe(1000);
    expect(t.costPerLead.value).toBeNull();
  });

  it("leaves cost per lead unavailable when spend was never recorded", () => {
    const t = campaignTotals([row({ leads: 20 })]);
    expect(t.spend.value).toBeNull();
    expect(t.costPerLead.value).toBeNull();
  });

  // Adding rupees to dollars produces a number with no meaning.
  it("refuses to total money across currencies, and says why", () => {
    const t = campaignTotals([
      row({ spend: 1000, currency: "INR", leads: 5 }),
      row({ spend: 50, currency: "USD", leads: 5 }),
    ]);
    expect(t.currencies).toEqual(["INR", "USD"]);
    expect(t.spend.value).toBeNull();
    expect(t.costPerLead.value).toBeNull();
    expect(t.spend.definition).toMatch(/more than one currency/);
    // Counts are unaffected by currency.
    expect(t.leads.value).toBe(10);
  });

  it("totals money when every money-bearing snapshot shares one currency", () => {
    const t = campaignTotals([row({ spend: 100, currency: "INR" }), row({ spend: 50, currency: "INR" }), row({ leads: 3 })]);
    expect(t.currencies).toEqual(["INR"]);
    expect(t.spend.value).toBe(150);
  });

  it("gives every figure a definition for 'How calculated'", () => {
    const t = campaignTotals([]);
    for (const [key, metric] of Object.entries(t)) {
      if (key === "currencies") continue;
      expect((metric as { definition: string }).definition.length).toBeGreaterThan(5);
    }
  });
});

describe("marketingFunnel", () => {
  it("reports counts per stage and conversion only between reported stages", () => {
    const funnel = marketingFunnel([row({ sessions: 1000, leads: 50, qualifiedLeads: 10 })]);
    const byKey = Object.fromEntries(funnel.map((s) => [s.key, s]));

    expect(byKey.sessions!.count).toBe(1000);
    expect(byKey.sessions!.conversionFromPrevious).toBeNull();
    // Engagement was not reported, so it cannot anchor the next conversion either.
    expect(byKey.engagements!.count).toBeNull();
    expect(byKey.leads!.count).toBe(50);
    expect(byKey.leads!.conversionFromPrevious).toBeNull();
    expect(byKey.qualifiedLeads!.conversionFromPrevious).toBe(0.2);
    expect(byKey.customers!.count).toBeNull();
  });

  it("keeps the stages in funnel order", () => {
    expect(marketingFunnel([]).map((s) => s.label)).toEqual([
      "Traffic",
      "Engagement",
      "Prospect",
      "Qualified prospect",
      "Opportunity",
      "Customer",
    ]);
  });
});

describe("formatMetric", () => {
  it("renders unavailable as an em dash, never 0", () => {
    expect(formatMetric(null, "count")).toBe("—");
    expect(formatMetric(null, "money", "INR")).toBe("—");
    expect(formatMetric(null, "percent")).toBe("—");
  });

  it("formats counts, percentages and money", () => {
    expect(formatMetric(12480, "count")).toBe("12,480");
    expect(formatMetric(0.042, "percent")).toBe("4.2%");
    expect(formatMetric(375000, "money", "INR")).toContain("3,75,000");
  });

  it("still shows a real zero as zero", () => {
    expect(formatMetric(0, "count")).toBe("0");
  });
});

describe("campaignPacing", () => {
  const plan = { budget: 1000, currency: "INR", startAt: "2026-09-01T00:00:00Z", endAt: "2026-09-11T00:00:00Z" };

  it("compares budget used with time elapsed", () => {
    const pacing = campaignPacing(plan, { spend: { value: 250, definition: "" }, currencies: ["INR"] }, new Date("2026-09-06T00:00:00Z"));
    expect(pacing).toEqual({ spendShare: 0.25, timeShare: 0.5, plannedDays: 11 });
  });

  it("is unavailable without reported spend, dates, or a matching currency", () => {
    const now = new Date("2026-09-06T00:00:00Z");
    expect(campaignPacing(plan, { spend: { value: null, definition: "" }, currencies: [] }, now)).toBeNull();
    expect(campaignPacing({ ...plan, endAt: null }, { spend: { value: 1, definition: "" }, currencies: [] }, now)).toBeNull();
    expect(campaignPacing(plan, { spend: { value: 1, definition: "" }, currencies: ["USD"] }, now)).toBeNull();
  });
});
