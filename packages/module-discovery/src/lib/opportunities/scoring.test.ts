import { describe, expect, it } from "vitest";
import { computeOpportunityScore, type ScoreComponents } from "./scoring";

const empty: ScoreComponents = {
  icpFit: null,
  buyerFit: null,
  needFit: null,
  timing: null,
  signalStrength: null,
  contactability: null,
  evidenceConfidence: null,
};

describe("computeOpportunityScore", () => {
  it("returns no false precision when there is insufficient evidence", () => {
    const result = computeOpportunityScore(empty);
    expect(result.score).toBeNull();
    expect(result.confidence).toBe("low");
    expect(result.reason).toBe("Insufficient evidence");
  });

  it("averages only the populated components, not zero-filling missing ones", () => {
    const result = computeOpportunityScore({ ...empty, icpFit: 80, buyerFit: 60 });
    expect(result.score).toBe(70);
    expect(result.confidence).toBe("low");
    expect(result.reason).toBe("Based on 2 of 7 score components");
  });

  it("reaches medium confidence once at least half the components are populated", () => {
    const result = computeOpportunityScore({ ...empty, icpFit: 100, buyerFit: 100, needFit: 100, timing: 100 });
    expect(result.confidence).toBe("medium");
  });

  it("reaches high confidence with no reason once every component is populated", () => {
    const result = computeOpportunityScore({
      icpFit: 90,
      buyerFit: 80,
      needFit: 70,
      timing: 60,
      signalStrength: 50,
      contactability: 40,
      evidenceConfidence: 30,
    });
    expect(result.score).toBe(60);
    expect(result.confidence).toBe("high");
    expect(result.reason).toBeNull();
  });
});
