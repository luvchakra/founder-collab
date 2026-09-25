/**
 * MKT-01. The server-boundary schemas: what a form cannot be trusted to have enforced.
 */
import { describe, expect, it } from "vitest";
import { campaignInputSchema, contentInputSchema, firstIssue, metricSnapshotSchema, seoItemInputSchema, strategyInputSchema } from "./schemas";

const baseCampaign = { name: "Smart Home Awareness", objective: "awareness", channel: "linkedin" };

describe("campaignInputSchema", () => {
  it("accepts a minimal campaign and normalises blanks to null", () => {
    const parsed = campaignInputSchema.parse({ ...baseCampaign, description: "  ", budget: "" });
    expect(parsed.description).toBeNull();
    expect(parsed.budget).toBeNull();
    expect(parsed.offeringId).toBeNull();
  });

  it("requires a name, objective and channel", () => {
    expect(campaignInputSchema.safeParse({ ...baseCampaign, name: " " }).success).toBe(false);
    expect(campaignInputSchema.safeParse({ ...baseCampaign, objective: "fame" }).success).toBe(false);
    expect(campaignInputSchema.safeParse({ ...baseCampaign, channel: "carrier_pigeon" }).success).toBe(false);
  });

  // §52 rules 3 and 4.
  it("refuses a negative budget", () => {
    const result = campaignInputSchema.safeParse({ ...baseCampaign, budget: -5, currency: "INR" });
    expect(result.success).toBe(false);
    expect(!result.success && firstIssue(result.error)).toMatch(/negative/);
  });

  it("refuses an end date before the start date", () => {
    const result = campaignInputSchema.safeParse({ ...baseCampaign, startAt: "2026-10-10", endAt: "2026-10-01" });
    expect(result.success).toBe(false);
    expect(!result.success && firstIssue(result.error)).toMatch(/end date/);
  });

  it("requires a currency whenever there is a budget", () => {
    const result = campaignInputSchema.safeParse({ ...baseCampaign, budget: "100000" });
    expect(result.success).toBe(false);
    expect(!result.success && firstIssue(result.error)).toMatch(/currency/);
  });

  it("parses a formatted budget and upper-cases the currency", () => {
    const parsed = campaignInputSchema.parse({ ...baseCampaign, budget: "1,00,000", currency: "inr" });
    expect(parsed.budget).toBe(100000);
    expect(parsed.currency).toBe("INR");
  });

  it("refuses a landing page that is not a web link", () => {
    expect(campaignInputSchema.safeParse({ ...baseCampaign, landingPageUrl: "javascript:alert(1)" }).success).toBe(false);
  });

  it("refuses an offering id that is not a uuid, rather than passing it to the database", () => {
    expect(campaignInputSchema.safeParse({ ...baseCampaign, offeringId: "1 or 1=1" }).success).toBe(false);
  });
});

describe("metricSnapshotSchema", () => {
  it("keeps blank fields as null — unreported, not zero", () => {
    const parsed = metricSnapshotSchema.parse({ metricDate: "2026-09-01", leads: "12", clicks: "" });
    expect(parsed.leads).toBe(12);
    expect(parsed.clicks).toBeNull();
  });

  it("keeps an explicit zero as zero", () => {
    expect(metricSnapshotSchema.parse({ metricDate: "2026-09-01", leads: "0" }).leads).toBe(0);
  });

  it("refuses a snapshot that reports nothing at all", () => {
    const result = metricSnapshotSchema.safeParse({ metricDate: "2026-09-01" });
    expect(result.success).toBe(false);
    expect(!result.success && firstIssue(result.error)).toMatch(/at least one number/);
  });

  it("refuses fractional or negative counts", () => {
    expect(metricSnapshotSchema.safeParse({ metricDate: "2026-09-01", leads: "2.5" }).success).toBe(false);
    expect(metricSnapshotSchema.safeParse({ metricDate: "2026-09-01", leads: "-1" }).success).toBe(false);
  });

  it("requires a currency for spend or revenue", () => {
    expect(metricSnapshotSchema.safeParse({ metricDate: "2026-09-01", spend: "500" }).success).toBe(false);
  });
});

describe("contentInputSchema", () => {
  it("requires a title and a known type", () => {
    expect(contentInputSchema.safeParse({ title: "", contentType: "blog" }).success).toBe(false);
    expect(contentInputSchema.safeParse({ title: "Tips", contentType: "tweetstorm" }).success).toBe(false);
    expect(contentInputSchema.safeParse({ title: "Tips", contentType: "blog" }).success).toBe(true);
  });
});

describe("strategyInputSchema", () => {
  it("splits multi-line fields into trimmed, non-empty lists", () => {
    const parsed = strategyInputSchema.parse({
      name: "FY27 strategy",
      supportingPoints: "Fast install\n\n  Local support  \n",
      channels: ["linkedin", "email"],
    });
    expect(parsed.supportingPoints).toEqual(["Fast install", "Local support"]);
    expect(parsed.channels).toEqual(["linkedin", "email"]);
  });

  it("refuses an unknown channel", () => {
    expect(strategyInputSchema.safeParse({ name: "S", channels: ["telepathy"] }).success).toBe(false);
  });
});

describe("seoItemInputSchema", () => {
  it("records an AI-search observation's answer and citations as structured fields", () => {
    const parsed = seoItemInputSchema.parse({
      title: "Not cited for 'best home security for complexes'",
      category: "ai_search_visibility",
      query: "best home security for large residential complexes",
      engine: "ChatGPT",
      companyAppears: "no",
      citedUrls: "https://a.example\n\nhttps://b.example",
    });
    expect(parsed.companyAppears).toBe(false);
    expect(parsed.citedUrls).toEqual(["https://a.example", "https://b.example"]);
  });

  it("leaves 'appears' unknown when the observer did not say", () => {
    expect(seoItemInputSchema.parse({ title: "t", category: "metadata" }).companyAppears).toBeNull();
  });
});
