import { describe, expect, it } from "vitest";
import { buildLimitEntitlementDecision } from "./limit-entitlement";

describe("buildLimitEntitlementDecision (PLATFORM-P0-05.2/05.3/06.1)", () => {
  it("treats an unconfigured (plan, resource) pair as unrestricted, not denied", () => {
    const decision = buildLimitEntitlementDecision("businesses", "free", null);
    expect(decision.allowed).toBe(true);
    expect(decision.limit).toBeNull();
    expect(decision.usage).toBeNull();
    expect(decision.reason).toContain("no configured limit");
  });

  it("denies outright when the resource is explicitly disabled on the plan", () => {
    const decision = buildLimitEntitlementDecision("automation_runs", "free", { state: "disabled", limit_value: null }, 0);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("automation_runs is disabled on the free plan.");
    expect(decision.limit).toBeNull();
  });

  it("allows with a null limit when the resource is unlimited on the plan, but still reports real usage", () => {
    const decision = buildLimitEntitlementDecision("ai_credits", "max", { state: "unlimited", limit_value: null }, 42);
    expect(decision.allowed).toBe(true);
    expect(decision.limit).toBeNull(); // never a fake huge number standing in for unlimited
    expect(decision.usage).toBe(42);
    expect(decision.remaining).toBeNull(); // no ceiling to subtract a remaining amount from
    expect(decision.reason).toBe("ai_credits is unlimited on the max plan.");
  });

  it("matches PLATFORM-P0-05.3's own worked example: at the limit, denied, remaining 0", () => {
    const decision = buildLimitEntitlementDecision("businesses", "pro", { state: "limited", limit_value: 5 }, 5);
    expect(decision.allowed).toBe(false);
    expect(decision.limit).toBe(5);
    expect(decision.usage).toBe(5);
    expect(decision.remaining).toBe(0);
    expect(decision.reason).toBe("pro plan allows 5 businesses.");
  });

  it("allows with real remaining when usage is under the limit", () => {
    const decision = buildLimitEntitlementDecision("businesses", "pro", { state: "limited", limit_value: 5 }, 2);
    expect(decision.allowed).toBe(true);
    expect(decision.usage).toBe(2);
    expect(decision.remaining).toBe(3);
  });

  it("never reports a negative remaining even if usage somehow exceeds the limit", () => {
    const decision = buildLimitEntitlementDecision("businesses", "pro", { state: "limited", limit_value: 5 }, 9);
    expect(decision.allowed).toBe(false);
    expect(decision.remaining).toBe(0);
  });

  it("defaults usage to 0 when not passed (an unconfigured/never-used resource)", () => {
    const decision = buildLimitEntitlementDecision("businesses", "pro", { state: "limited", limit_value: 5 });
    expect(decision.usage).toBe(0);
    expect(decision.remaining).toBe(5);
    expect(decision.allowed).toBe(true);
  });

  it("source is always 'plan'", () => {
    for (const row of [null, { state: "unlimited", limit_value: null } as const, { state: "limited", limit_value: 1 } as const]) {
      expect(buildLimitEntitlementDecision("users", "free", row).source).toBe("plan");
    }
  });
});
