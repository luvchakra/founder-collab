import { describe, expect, it } from "vitest";
import { classifyEnumConfidence, classifyEvidenceConfidences, classifyNumericConfidence, worstReviewLevel } from "./review";

describe("worstReviewLevel", () => {
  it("is automated for an empty list -- nothing assessed means nothing to flag", () => {
    expect(worstReviewLevel([])).toBe("automated");
  });

  it("returns the single level for a one-item list", () => {
    expect(worstReviewLevel(["needs_review"])).toBe("needs_review");
  });

  it("picks the worst level across a mixed list, order-independent", () => {
    expect(worstReviewLevel(["automated", "needs_review", "automated"])).toBe("needs_review");
    expect(worstReviewLevel(["needs_review", "insufficient_evidence", "automated"])).toBe("insufficient_evidence");
    expect(worstReviewLevel(["insufficient_evidence", "automated"])).toBe("insufficient_evidence");
  });

  it("stays automated when every level is automated", () => {
    expect(worstReviewLevel(["automated", "automated"])).toBe("automated");
  });
});

describe("classifyNumericConfidence", () => {
  it("is automated at and above the 0.7 threshold", () => {
    expect(classifyNumericConfidence(0.7)).toBe("automated");
    expect(classifyNumericConfidence(1)).toBe("automated");
  });

  it("needs review in the middle tertile", () => {
    expect(classifyNumericConfidence(0.4)).toBe("needs_review");
    expect(classifyNumericConfidence(0.69)).toBe("needs_review");
  });

  it("is insufficient evidence below the 0.4 threshold", () => {
    expect(classifyNumericConfidence(0.39)).toBe("insufficient_evidence");
    expect(classifyNumericConfidence(0)).toBe("insufficient_evidence");
  });
});

describe("classifyEnumConfidence", () => {
  it("is insufficient evidence whenever hasEvidence is false, regardless of the confidence value", () => {
    expect(classifyEnumConfidence("high", false)).toBe("insufficient_evidence");
    expect(classifyEnumConfidence("low", false)).toBe("insufficient_evidence");
  });

  it("is automated only for high confidence with evidence", () => {
    expect(classifyEnumConfidence("high", true)).toBe("automated");
  });

  it("needs review for medium or low confidence with evidence", () => {
    expect(classifyEnumConfidence("medium", true)).toBe("needs_review");
    expect(classifyEnumConfidence("low", true)).toBe("needs_review");
  });
});

describe("classifyEvidenceConfidences", () => {
  it("is insufficient evidence for an empty list", () => {
    expect(classifyEvidenceConfidences([])).toBe("insufficient_evidence");
  });

  it("is automated only when every item is high confidence", () => {
    expect(classifyEvidenceConfidences(["high", "high"])).toBe("automated");
  });

  it("needs review when the worst item is medium or low, order-independent", () => {
    expect(classifyEvidenceConfidences(["high", "medium", "high"])).toBe("needs_review");
    expect(classifyEvidenceConfidences(["low", "high"])).toBe("needs_review");
  });
});
