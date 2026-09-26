import { beforeEach, describe, expect, it, vi } from "vitest";

// EXP-CRM-08 -- Reviews export.

const mocks = vi.hoisted(() => ({ listReviewItemsForExport: vi.fn() }));
vi.mock("./queries", () => ({ listReviewItemsForExport: mocks.listReviewItemsForExport }));

import { crmReviewsExport } from "./reviews";
import { BUSINESS_ID, exportContext, headers, requestParams, rowsOf, serialized } from "./test-support";

function review(overrides: Record<string, unknown>) {
  return {
    id: "r",
    business_id: BUSINESS_ID,
    channel_connection_id: "conn-1",
    party_id: null,
    provider: "google_business_profile",
    external_review_id: "ext-review-123",
    rating: 4,
    comment_excerpt: "Great service",
    reviewer_name: "Ravi",
    occurred_at: "2026-09-20T10:00:00Z",
    status: "new",
    draft_reply: "UNPUBLISHED DRAFT TEXT",
    draft_input_hash: "hash-abc",
    draft_generated_at: "2026-09-20T11:00:00Z",
    created_at: "2026-09-20T10:00:00Z",
    updated_at: "2026-09-20T10:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listReviewItemsForExport.mockResolvedValue([
    review({ id: "r1" }),
    review({ id: "r2", rating: null, reviewer_name: null, comment_excerpt: null, status: "responded" }),
  ]);
});

describe("crm.reviews (EXP-CRM-08)", () => {
  it("is licensed and permissioned like the page", () => {
    expect(crmReviewsExport.id).toBe("crm.reviews");
    expect(crmReviewsExport.module).toBe("crm");
    expect(crmReviewsExport.permissions).toEqual(["crm.view"]);
  });

  it("reads the resolved business only (tenant isolation)", async () => {
    await crmReviewsExport.load(exportContext(), crmReviewsExport.parseFilters!(requestParams({ status: "new" })));
    expect(mocks.listReviewItemsForExport).toHaveBeenCalledWith(BUSINESS_ID);
  });

  it("exports the page's labels and no sentiment column (nothing stored, nothing invented)", async () => {
    const workbook = await crmReviewsExport.load(exportContext(), {});
    expect(headers(workbook, "Reviews")).toEqual(["Source", "Reviewer", "Rating", "Review date", "Review", "Response state"]);
    const [first, second] = rowsOf(workbook, "Reviews");
    expect(first).toMatchObject({ Source: "Google Business Profile", Reviewer: "Ravi", Rating: 4, Review: "Great service", "Response state": "Awaiting reply" });
    expect(second).toMatchObject({ Reviewer: "Anonymous", Rating: null, Review: "", "Response state": "Replied" });
  });

  it("never exports drafts or provider identifiers", async () => {
    const text = serialized(await crmReviewsExport.load(exportContext(), {}));
    expect(text).not.toContain("UNPUBLISHED DRAFT TEXT");
    expect(text).not.toContain("ext-review-123");
    expect(text).not.toContain("hash-abc");
  });
});
