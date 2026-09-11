import { describe, expect, it } from "vitest";
import { normalizeGoogleBusinessProfileReview } from "./google-business-profile-adapter";

describe("normalizeGoogleBusinessProfileReview", () => {
  it("maps a rated, named, replied-to review", () => {
    const normalized = normalizeGoogleBusinessProfileReview({
      reviewId: "rev-1",
      reviewer: { displayName: "Priya Sharma", isAnonymous: false },
      starRating: "FIVE",
      comment: "Great service!",
      createTime: "2026-09-01T10:00:00Z",
      reviewReply: { comment: "Thank you!", updateTime: "2026-09-02T10:00:00Z" },
    });
    expect(normalized).toEqual({
      externalReviewId: "rev-1",
      rating: 5,
      commentExcerpt: "Great service!",
      reviewerName: "Priya Sharma",
      occurredAt: "2026-09-01T10:00:00Z",
      hasReply: true,
    });
  });

  it("maps an anonymous, unreplied, uncommented review to nulls", () => {
    const normalized = normalizeGoogleBusinessProfileReview({
      reviewId: "rev-2",
      reviewer: { displayName: "Anonymous User", isAnonymous: true },
      starRating: "THREE",
      createTime: "2026-09-01T10:00:00Z",
    });
    expect(normalized.reviewerName).toBeNull();
    expect(normalized.commentExcerpt).toBeNull();
    expect(normalized.hasReply).toBe(false);
    expect(normalized.rating).toBe(3);
  });

  it("maps a missing or unspecified star rating to null, not zero", () => {
    expect(normalizeGoogleBusinessProfileReview({ reviewId: "rev-3", createTime: "2026-09-01T10:00:00Z" }).rating).toBeNull();
    expect(
      normalizeGoogleBusinessProfileReview({ reviewId: "rev-4", starRating: "STAR_RATING_UNSPECIFIED", createTime: "2026-09-01T10:00:00Z" }).rating,
    ).toBeNull();
  });
});
