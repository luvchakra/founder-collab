// EXP-FND-03 -- Investor readiness export: every item with labels, and the status and
// recommendation labelled for what they are (a person's call, user-entered text).
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ listReadinessItems: vi.fn() }));
vi.mock("../../lib/funding/queries", () => ({ listReadinessItems: h.listReadinessItems }));

import { fundingReadinessExport } from "./readiness";
import { BUSINESS_ID, exportContext, headers, params, rowValues } from "./test-support";

beforeEach(() => {
  vi.clearAllMocks();
  h.listReadinessItems.mockResolvedValue([
    {
      id: "r-1",
      category: "legal_compliance",
      title: "Cap table",
      description: null,
      status: "needs_attention",
      evidence: [{ note: "Draft from CA", url: "https://files.example/cap" }],
      missingInformation: "ESOP pool",
      recommendedAction: "Ask the CA to add the pool",
      dueAt: "2020-01-01",
      lastReviewedAt: null,
      updatedAt: "2026-09-20T00:00:00Z",
    },
    {
      id: "r-2",
      category: "gtm",
      title: "GTM plan",
      description: null,
      status: "ready",
      evidence: [],
      missingInformation: null,
      recommendedAction: null,
      dueAt: null,
      lastReviewedAt: "2026-09-21T00:00:00Z",
      updatedAt: "2026-09-21T00:00:00Z",
    },
  ]);
});

describe("EXP-FND-03 funding.readiness", () => {
  it("is a Discovery export gated on funding.view", () => {
    expect(fundingReadinessExport.id).toBe("funding.readiness");
    expect(fundingReadinessExport.module).toBe("discovery");
    expect(fundingReadinessExport.permissions).toEqual(["funding.view"]);
  });

  it("reads the context's business only", async () => {
    expect(fundingReadinessExport.parseFilters!(params())).toEqual({});
    await fundingReadinessExport.load(exportContext(), {});
    expect(h.listReadinessItems).toHaveBeenCalledWith(BUSINESS_ID);
  });

  it("exports labels, evidence and provenance columns", async () => {
    const wb = await fundingReadinessExport.load(exportContext(), {});
    expect(headers(wb, "Readiness")).toEqual([
      "Category", "Requirement", "Description", "Status", "Status set by", "Evidence", "Evidence items", "Missing information",
      "Recommended action", "Recommendation source", "Due", "Overdue", "Last reviewed", "Last updated",
    ]);
    expect(rowValues(wb, "Readiness", 0)).toMatchObject({
      Category: "Legal / Compliance",
      Status: "Needs attention",
      "Status set by": "A person (never set automatically)",
      Evidence: ["Draft from CA — https://files.example/cap"],
      "Recommendation source": "User-entered",
      Overdue: true,
    });
    expect(rowValues(wb, "Readiness", 1)).toMatchObject({ Category: "GTM", Status: "Ready", "Recommended action": null, "Recommendation source": null, Overdue: false });
  });
});
