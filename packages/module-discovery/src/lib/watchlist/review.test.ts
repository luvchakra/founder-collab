import { describe, expect, it } from "vitest";
import { computeWatchReviewState, findOtherOfferingWatches, sortWatchlistRows } from "./review";

// DISC-OFFER-P1-01.3 "Account Watchlist"
const NOW = new Date("2026-09-26T12:00:00Z");

describe("computeWatchReviewState", () => {
  it("reads the next review date against now", () => {
    expect(computeWatchReviewState(null, NOW)).toBe("not_set");
    expect(computeWatchReviewState("2026-09-20T00:00:00Z", NOW)).toBe("overdue");
    expect(computeWatchReviewState("2026-09-26T12:00:00Z", NOW)).toBe("overdue");
    expect(computeWatchReviewState("2026-09-30T00:00:00Z", NOW)).toBe("due_soon");
    expect(computeWatchReviewState("2026-10-03T12:00:00Z", NOW)).toBe("due_soon");
    expect(computeWatchReviewState("2026-10-20T00:00:00Z", NOW)).toBe("scheduled");
  });

  it("treats an unparseable date as not set rather than guessing", () => {
    expect(computeWatchReviewState("not a date", NOW)).toBe("not_set");
  });
});

describe("sortWatchlistRows", () => {
  it("puts overdue reviews first, then due soon, then later, then undated (newest first)", () => {
    const rows = [
      { id: "undated-old", reviewState: "not_set" as const, next_review_at: null, created_at: "2026-09-01T00:00:00Z" },
      { id: "later", reviewState: "scheduled" as const, next_review_at: "2026-11-01T00:00:00Z", created_at: "2026-09-01T00:00:00Z" },
      { id: "overdue-recent", reviewState: "overdue" as const, next_review_at: "2026-09-25T00:00:00Z", created_at: "2026-09-01T00:00:00Z" },
      { id: "undated-new", reviewState: "not_set" as const, next_review_at: null, created_at: "2026-09-10T00:00:00Z" },
      { id: "overdue-oldest", reviewState: "overdue" as const, next_review_at: "2026-09-01T00:00:00Z", created_at: "2026-09-01T00:00:00Z" },
      { id: "soon", reviewState: "due_soon" as const, next_review_at: "2026-09-28T00:00:00Z", created_at: "2026-09-01T00:00:00Z" },
    ];
    expect(sortWatchlistRows(rows).map((r) => r.id)).toEqual(["overdue-oldest", "overdue-recent", "soon", "later", "undated-new", "undated-old"]);
  });
});

describe("findOtherOfferingWatches", () => {
  it("matches the same account under other offerings by domain, else normalized name", () => {
    const result = findOtherOfferingWatches(
      [
        { prospectId: "p-acme", companyName: "Acme", domain: "acme.com" },
        { prospectId: "p-globex", companyName: "Globex  Corp", domain: null },
        { prospectId: "p-solo", companyName: "Initech", domain: null },
      ],
      [
        { productId: "training", productName: "IAM Training", companyName: "ACME Inc", domain: "ACME.com", watchReason: "New L&D budget" },
        { productId: "assessment", productName: "Cyber Assessment", companyName: "Acme", domain: "acme.com", watchReason: "Audit due" },
        { productId: "training", productName: "IAM Training", companyName: "globex corp", domain: null, watchReason: "Hiring" },
        // Same name but a different domain is a different company -- never merged.
        { productId: "training", productName: "IAM Training", companyName: "Initech", domain: "initech.io", watchReason: "x" },
      ],
    );
    expect(result.get("p-acme")).toEqual([
      { productId: "assessment", productName: "Cyber Assessment", watchReason: "Audit due" },
      { productId: "training", productName: "IAM Training", watchReason: "New L&D budget" },
    ]);
    expect(result.get("p-globex")).toEqual([{ productId: "training", productName: "IAM Training", watchReason: "Hiring" }]);
    expect(result.has("p-solo")).toBe(false);
  });
});
