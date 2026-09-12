import { describe, expect, it } from "vitest";
import { DEFAULT_WARNING_THRESHOLD_PERCENT, describeLimitWarning, isApproachingLimit } from "./limit-warning-messaging";
import type { EntitlementDecision } from "./types";

function allowed(overrides: Partial<EntitlementDecision> = {}): EntitlementDecision {
  return {
    allowed: true,
    reason: "opportunities usage (80) is within the pro plan's limit of 100.",
    source: "plan",
    limit: 100,
    usage: 80,
    remaining: 20,
    ...overrides,
  };
}

describe("isApproachingLimit (PLATFORM-P0-06.5 decision #3)", () => {
  it("is false below the default 80% threshold", () => {
    expect(isApproachingLimit(79, 100)).toBe(false);
  });

  it("is true at exactly the default 80% threshold", () => {
    expect(isApproachingLimit(80, 100)).toBe(true);
  });

  it("is true above the default 80% threshold but still under the limit", () => {
    expect(isApproachingLimit(95, 100)).toBe(true);
  });

  it("is false once usage reaches the limit -- that is describeLimitReached()'s own case, not a warning", () => {
    expect(isApproachingLimit(100, 100)).toBe(false);
  });

  it("is false once usage exceeds the limit", () => {
    expect(isApproachingLimit(110, 100)).toBe(false);
  });

  it("is false when limit is null (unlimited/disabled/unconfigured) -- no ratio to compute", () => {
    expect(isApproachingLimit(1000, null)).toBe(false);
  });

  it("is false when usage is null", () => {
    expect(isApproachingLimit(null, 100)).toBe(false);
  });

  it("is false when limit is zero -- avoids a division by zero, never a false warning", () => {
    expect(isApproachingLimit(0, 0)).toBe(false);
  });

  it("accepts a custom threshold percentage", () => {
    expect(isApproachingLimit(50, 100, 50)).toBe(true);
    expect(isApproachingLimit(49, 100, 50)).toBe(false);
  });

  it("DEFAULT_WARNING_THRESHOLD_PERCENT is 80, named and exported for easy discovery", () => {
    expect(DEFAULT_WARNING_THRESHOLD_PERCENT).toBe(80);
  });
});

describe("describeLimitWarning (PLATFORM-P0-06.5 decision #3)", () => {
  it("returns null when usage has not crossed the threshold", () => {
    expect(describeLimitWarning(allowed({ usage: 50, limit: 100 }), "Opportunities", "Pro")).toBeNull();
  });

  it("returns copy once usage has crossed the threshold", () => {
    const copy = describeLimitWarning(allowed({ usage: 85, limit: 100 }), "Opportunities", "Pro");
    expect(copy).not.toBeNull();
    expect(copy?.title).toBe("Approaching your Pro plan limit");
    expect(copy?.description).toBe("You've used 85 of your Pro plan's 100 Opportunities limit.");
  });

  it("returns null once usage has reached or passed the limit -- describeLimitReached() (or a soft-limit allowance) owns that copy instead", () => {
    expect(describeLimitWarning(allowed({ usage: 100, limit: 100 }), "Opportunities", "Pro")).toBeNull();
    expect(describeLimitWarning(allowed({ usage: 120, limit: 100 }), "Opportunities", "Pro")).toBeNull();
  });

  it("returns null for a decision with no numeric limit at all", () => {
    expect(describeLimitWarning(allowed({ usage: null, limit: null }), "Opportunities", "Pro")).toBeNull();
  });

  it("respects a custom threshold percentage", () => {
    expect(describeLimitWarning(allowed({ usage: 60, limit: 100 }), "Opportunities", "Pro", 50)).not.toBeNull();
    expect(describeLimitWarning(allowed({ usage: 40, limit: 100 }), "Opportunities", "Pro", 50)).toBeNull();
  });
});
