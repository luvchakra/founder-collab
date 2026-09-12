import { describe, expect, it } from "vitest";
import { describeLimitReached } from "./limit-reached-messaging";
import type { EntitlementDecision } from "./types";

function denied(overrides: Partial<EntitlementDecision> = {}): EntitlementDecision {
  return {
    allowed: false,
    reason: "pro plan allows 5 businesses.",
    source: "plan",
    limit: 5,
    usage: 5,
    remaining: 0,
    ...overrides,
  };
}

describe("describeLimitReached (PLATFORM-P0-06.4)", () => {
  it("matches the doc's own worked example shape for a numeric-limit denial", () => {
    const copy = describeLimitReached(denied({ limit: 100 }), "Opportunities", "Pro");
    expect(copy.title).toBe("You've reached your Pro plan limit");
    expect(copy.description).toBe("You've reached your Pro plan limit of 100 Opportunities.");
  });

  it("never mangles a resource label containing an acronym or brand name (never lowercases mid-word)", () => {
    expect(describeLimitReached(denied({ limit: 5 }), "WhatsApp conversations", "Free").description).toBe(
      "You've reached your Free plan limit of 5 WhatsApp conversations.",
    );
    expect(describeLimitReached(denied({ limit: 1000 }), "AI runs", "Free").description).toBe(
      "You've reached your Free plan limit of 1000 AI runs.",
    );
    expect(describeLimitReached(denied({ limit: 10000 }), "API calls", "Max").description).toBe(
      "You've reached your Max plan limit of 10000 API calls.",
    );
  });

  it("falls back to the raw reason, with a distinct title, when there is no numeric limit (e.g. a disabled resource)", () => {
    const copy = describeLimitReached(
      denied({ limit: null, usage: null, remaining: null, reason: "automation_runs is disabled on the free plan." }),
      "Automation runs",
      "Free",
    );
    expect(copy.title).toBe("Automation runs isn't available on your plan");
    expect(copy.description).toBe("automation_runs is disabled on the free plan.");
  });

  it("falls back to the raw reason when there is no resolvable plan at all", () => {
    const copy = describeLimitReached(
      denied({ limit: null, usage: null, remaining: null, reason: "This business has no resolvable plan." }),
      "Businesses",
      "unknown",
    );
    expect(copy.description).toBe("This business has no resolvable plan.");
  });

  it("throws for an allowed decision -- this copy only makes sense for a denial", () => {
    expect(() => describeLimitReached({ ...denied(), allowed: true }, "Businesses", "Pro")).toThrow();
  });
});
