import { describe, expect, it } from "vitest";
import { computeNextBestAction, effectiveRecommendedAction, type NextBestActionInput } from "./next-best-action";

function input(overrides: Partial<NextBestActionInput>): NextBestActionInput {
  return {
    status: "new",
    score: null,
    confidence: "low",
    hasResearch: false,
    negativeSignalReasons: [],
    hasContact: false,
    bestContactability: null,
    hasDraftMessage: false,
    hasSentMessage: false,
    ...overrides,
  };
}

describe("computeNextBestAction", () => {
  it("recommends nothing for an already-resolved opportunity", () => {
    for (const status of ["sent_to_crm", "dismissed", "expired"] as const) {
      const result = computeNextBestAction(input({ status }));
      expect(result.action).toBeNull();
    }
  });

  it("dismisses on a hard disqualifying negative signal even with a strong score", () => {
    const result = computeNextBestAction(
      input({
        hasResearch: true,
        score: 90,
        confidence: "high",
        hasContact: true,
        bestContactability: "high",
        hasSentMessage: true,
        negativeSignalReasons: ["wrong_industry"],
      }),
    );
    expect(result.action).toBe("dismiss");
  });

  it("does not dismiss on a soft negative signal (insufficient_evidence)", () => {
    const result = computeNextBestAction(input({ negativeSignalReasons: ["insufficient_evidence"] }));
    expect(result.action).not.toBe("dismiss");
  });

  it("recommends research_more when there is no research yet", () => {
    const result = computeNextBestAction(input({ hasResearch: false }));
    expect(result.action).toBe("research_more");
  });

  it("recommends research_more when research exists but score is null", () => {
    const result = computeNextBestAction(input({ hasResearch: true, score: null }));
    expect(result.action).toBe("research_more");
  });

  it("recommends find_better_contact with no contact on file", () => {
    const result = computeNextBestAction(input({ hasResearch: true, score: 50, hasContact: false }));
    expect(result.action).toBe("find_better_contact");
  });

  it("recommends find_better_contact when the only contact has low contactability", () => {
    const result = computeNextBestAction(
      input({ hasResearch: true, score: 50, hasContact: true, bestContactability: "low" }),
    );
    expect(result.action).toBe("find_better_contact");
  });

  it("recommends draft_message once a reachable contact exists but no message yet", () => {
    const result = computeNextBestAction(
      input({ hasResearch: true, score: 50, hasContact: true, bestContactability: "medium" }),
    );
    expect(result.action).toBe("draft_message");
  });

  it("recommends send_to_crm for a strong, high-confidence opportunity already being worked", () => {
    const result = computeNextBestAction(
      input({
        hasResearch: true,
        score: 75,
        confidence: "high",
        hasContact: true,
        bestContactability: "high",
        hasSentMessage: true,
      }),
    );
    expect(result.action).toBe("send_to_crm");
  });

  it("recommends watch for a low-confidence opportunity already in motion", () => {
    const result = computeNextBestAction(
      input({
        hasResearch: true,
        score: 40,
        confidence: "low",
        hasContact: true,
        bestContactability: "medium",
        hasDraftMessage: true,
      }),
    );
    expect(result.action).toBe("watch");
  });

  it("recommends wait as the default steady state", () => {
    const result = computeNextBestAction(
      input({
        hasResearch: true,
        score: 55,
        confidence: "medium",
        hasContact: true,
        bestContactability: "medium",
        hasSentMessage: true,
      }),
    );
    expect(result.action).toBe("wait");
  });
});

describe("effectiveRecommendedAction", () => {
  it("prefers a founder's override over the computed recommendation", () => {
    expect(effectiveRecommendedAction({ recommended_action: "wait", recommended_action_override: "send_to_crm" })).toBe("send_to_crm");
  });

  it("falls back to the computed recommendation when there is no override", () => {
    expect(effectiveRecommendedAction({ recommended_action: "watch", recommended_action_override: null })).toBe("watch");
  });

  it("is null when neither has ever been set", () => {
    expect(effectiveRecommendedAction({ recommended_action: null, recommended_action_override: null })).toBeNull();
  });
});
