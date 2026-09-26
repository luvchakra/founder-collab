// EXP-MKT-06 -- Website & SEO export: the SEO items in the page's status view, with
// their source, plus the latest crawl's page inventory on a separate sheet.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getLatestWebsiteOnboardingRun: vi.fn(),
  listWebsiteOnboardingPages: vi.fn(),
  listSeoItemsForExport: vi.fn(),
}));
vi.mock("../../lib/website-onboarding/queries", () => ({
  getLatestWebsiteOnboardingRun: h.getLatestWebsiteOnboardingRun,
  listWebsiteOnboardingPages: h.listWebsiteOnboardingPages,
}));
vi.mock("./queries", () => ({ listSeoItemsForExport: h.listSeoItemsForExport }));

import { marketingWebsiteSeoExport } from "./website-seo";
import { BUSINESS_ID, exportContext, headers, params, rowValues, sheet } from "./test-support";

beforeEach(() => {
  vi.clearAllMocks();
  h.getLatestWebsiteOnboardingRun.mockResolvedValue({ id: "run-1", website: "https://acme.example", completed_at: "2026-09-10T08:00:00Z", created_at: "2026-09-10T07:00:00Z" });
  h.listWebsiteOnboardingPages.mockResolvedValue([
    { id: "p-1", run_id: "run-1", url: "https://acme.example/pricing", category: "pricing", status: "succeeded", error: null, fetched_at: "2026-09-10T07:30:00Z", created_at: "" },
  ]);
  h.listSeoItemsForExport.mockResolvedValue([
    {
      id: "s-1",
      pageUrl: "https://acme.example/pricing",
      category: "metadata",
      severity: "high",
      title: "Missing meta description",
      description: null,
      recommendedAction: "Write one",
      evidence: { note: "Checked by hand" },
      source: "manual",
      sourceUrl: null,
      observedAt: "2026-09-12",
      status: "in_progress",
      updatedAt: "2026-09-12T00:00:00Z",
    },
    {
      id: "s-2",
      pageUrl: null,
      category: "ai_search_visibility",
      severity: "medium",
      title: "Not mentioned",
      description: null,
      recommendedAction: null,
      evidence: { query: "best payroll", engine: "Assistant X", companyAppears: false, citedUrls: ["https://a.example", "https://b.example"] },
      source: "ai",
      sourceUrl: null,
      observedAt: null,
      status: "open",
      updatedAt: "2026-09-12T00:00:00Z",
    },
  ]);
});

describe("EXP-MKT-06 marketing.website-seo", () => {
  it("is a Discovery export gated on marketing.view", () => {
    expect(marketingWebsiteSeoExport.id).toBe("marketing.website-seo");
    expect(marketingWebsiteSeoExport.module).toBe("discovery");
    expect(marketingWebsiteSeoExport.permissions).toEqual(["marketing.view"]);
  });

  it("uses the page's status filter and the context's business", async () => {
    expect(marketingWebsiteSeoExport.parseFilters!(params())).toEqual({ status: "active" });
    const filters = marketingWebsiteSeoExport.parseFilters!(params({ status: "resolved" }));
    await marketingWebsiteSeoExport.load(exportContext(), filters);
    expect(h.listSeoItemsForExport).toHaveBeenCalledWith(BUSINESS_ID, "resolved");
    expect(h.getLatestWebsiteOnboardingRun).toHaveBeenCalledWith(BUSINESS_ID);
    expect(h.listWebsiteOnboardingPages).toHaveBeenCalledWith("run-1");
  });

  it("exports items with labels and provenance, and the crawl inventory separately", async () => {
    const wb = await marketingWebsiteSeoExport.load(exportContext(), { status: "active" });
    expect(headers(wb, "SEO items").slice(0, 9)).toEqual(["Page", "Category", "Issue", "Severity", "Status", "Recommendation", "Source", "Source URL", "Observed"]);
    expect(rowValues(wb, "SEO items", 0)).toMatchObject({ Category: "Metadata", Severity: "High", Status: "In progress", Source: "Logged by a person", "What was observed": "Checked by hand" });
    expect(rowValues(wb, "SEO items", 1)).toMatchObject({
      Category: "AI search visibility",
      Source: "AI-inferred",
      "Company appeared": false,
      "Sources cited": ["https://a.example", "https://b.example"],
      Observed: null,
    });
    expect(rowValues(wb, "Crawl pages")).toEqual({ URL: "https://acme.example/pricing", "Page type": "Pricing", "Crawl status": "Fetched", Fetched: "2026-09-10T07:30:00Z" });
    expect(wb.metadata).toMatchObject({ "Last crawl": "2026-09-10" });
  });

  it("still exports the items when the site has never been crawled", async () => {
    h.getLatestWebsiteOnboardingRun.mockResolvedValue(null);
    const wb = await marketingWebsiteSeoExport.load(exportContext(), { status: "active" });
    expect(sheet(wb, "Crawl pages").rows).toHaveLength(0);
    expect(h.listWebsiteOnboardingPages).not.toHaveBeenCalled();
  });
});
