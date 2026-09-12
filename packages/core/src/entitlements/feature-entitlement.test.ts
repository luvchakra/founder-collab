import { describe, expect, it } from "vitest";
import { buildFeatureEntitlementDecision } from "./feature-entitlement";

describe("buildFeatureEntitlementDecision (PLATFORM-P0-05.2/05.3)", () => {
  it("is allowed, source plan, when the plan entitles the feature", () => {
    const decision = buildFeatureEntitlementDecision("Advanced Signals", "pro", true);
    expect(decision).toEqual({
      allowed: true,
      reason: "Advanced Signals is included in the pro plan.",
      source: "plan",
      limit: null,
      usage: null,
      remaining: null,
    });
  });

  it("is not allowed when the plan does not entitle the feature (no plan_features row)", () => {
    const decision = buildFeatureEntitlementDecision("Advanced Signals", "free", false);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("Advanced Signals is not included in the free plan.");
    expect(decision.source).toBe("plan");
  });

  it("is not allowed, with an unrecognized-feature reason, when the feature key has no catalog row", () => {
    const decision = buildFeatureEntitlementDecision("not_a_real_feature", null, false);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("not_a_real_feature is not a recognized feature.");
  });

  it("always returns null limit/usage/remaining -- a feature check is a boolean, not a quantity", () => {
    for (const enabled of [true, false]) {
      const decision = buildFeatureEntitlementDecision("Some Feature", "max", enabled);
      expect(decision.limit).toBeNull();
      expect(decision.usage).toBeNull();
      expect(decision.remaining).toBeNull();
    }
  });
});
