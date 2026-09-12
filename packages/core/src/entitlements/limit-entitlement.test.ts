import { describe, expect, it } from "vitest";
import { buildLimitEntitlementDecision } from "./limit-entitlement";

describe("buildLimitEntitlementDecision (PLATFORM-P0-05.2/05.3)", () => {
  it("treats an unconfigured (plan, resource) pair as unrestricted, not denied", () => {
    const decision = buildLimitEntitlementDecision("businesses", "free", null);
    expect(decision.allowed).toBe(true);
    expect(decision.limit).toBeNull();
    expect(decision.reason).toContain("no configured limit");
  });

  it("denies outright when the resource is explicitly disabled on the plan", () => {
    const decision = buildLimitEntitlementDecision("automation_runs", "free", { state: "disabled", limit_value: null });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("automation_runs is disabled on the free plan.");
    expect(decision.limit).toBeNull();
  });

  it("allows with a null limit when the resource is unlimited on the plan", () => {
    const decision = buildLimitEntitlementDecision("ai_credits", "max", { state: "unlimited", limit_value: null });
    expect(decision.allowed).toBe(true);
    expect(decision.limit).toBeNull(); // never a fake huge number standing in for unlimited
    expect(decision.reason).toBe("ai_credits is unlimited on the max plan.");
  });

  it("reports the real configured limit, with usage/remaining still null (no usage counters yet)", () => {
    const decision = buildLimitEntitlementDecision("businesses", "pro", { state: "limited", limit_value: 5 });
    expect(decision.allowed).toBe(true);
    expect(decision.limit).toBe(5);
    expect(decision.usage).toBeNull();
    expect(decision.remaining).toBeNull();
    expect(decision.reason).toContain("limited to 5");
    expect(decision.reason).toContain("PLATFORM-P0-06.1");
  });

  it("source is always 'plan'", () => {
    for (const row of [null, { state: "unlimited", limit_value: null } as const, { state: "limited", limit_value: 1 } as const]) {
      expect(buildLimitEntitlementDecision("users", "free", row).source).toBe("plan");
    }
  });
});
