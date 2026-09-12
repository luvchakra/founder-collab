import { describe, expect, it } from "vitest";
import { buildConsumeEntitlementDecision, buildLimitEntitlementDecision } from "./limit-entitlement";

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

  it("defaults an unmarked 'limited' row to hard behavior (limit_type not present) -- unchanged from before PLATFORM-P0-06.5", () => {
    const decision = buildLimitEntitlementDecision("businesses", "pro", { state: "limited", limit_value: 5 }, 5);
    expect(decision.allowed).toBe(false);
  });

  it("a hard limit (explicit) still denies at the limit, exactly as before", () => {
    const decision = buildLimitEntitlementDecision("businesses", "pro", { state: "limited", limit_value: 5, limit_type: "hard" }, 5);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("pro plan allows 5 businesses.");
  });

  it("PLATFORM-P0-06.5 decision #1: a soft limit under its guideline behaves exactly like a hard limit's own 'within' case", () => {
    const decision = buildLimitEntitlementDecision("businesses", "pro", { state: "limited", limit_value: 5, limit_type: "soft" }, 3);
    expect(decision.allowed).toBe(true);
    expect(decision.usage).toBe(3);
    expect(decision.remaining).toBe(2);
    expect(decision.reason).toBe("businesses usage (3) is within the pro plan's limit of 5.");
  });

  it("PLATFORM-P0-06.5 decision #1: a soft limit at its guideline is allowed, not denied, with guideline copy", () => {
    const decision = buildLimitEntitlementDecision("businesses", "pro", { state: "limited", limit_value: 5, limit_type: "soft" }, 5);
    expect(decision.allowed).toBe(true);
    expect(decision.limit).toBe(5);
    expect(decision.usage).toBe(5);
    expect(decision.reason).toBe("businesses usage (5) is over your pro plan's guideline of 5.");
  });

  it("PLATFORM-P0-06.5 decision #1: a soft limit over its guideline is still allowed -- no ceiling, never denied", () => {
    const decision = buildLimitEntitlementDecision("businesses", "pro", { state: "limited", limit_value: 5, limit_type: "soft" }, 9);
    expect(decision.allowed).toBe(true);
    expect(decision.limit).toBe(5);
    expect(decision.usage).toBe(9);
    expect(decision.remaining).toBe(0); // never negative, same clamping as the hard case
    expect(decision.reason).toBe("businesses usage (9) is over your pro plan's guideline of 5.");
  });
});

describe("buildConsumeEntitlementDecision (PLATFORM-P0-06.3)", () => {
  it("denies outright when the resource is disabled on the plan, with no side effect reported", () => {
    const decision = buildConsumeEntitlementDecision(
      "automation_runs",
      "free",
      { state: "disabled", limit_value: null, usage_before: 3, usage_after: 3, granted: false },
      1,
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("automation_runs is disabled on the free plan.");
    expect(decision.limit).toBeNull();
    expect(decision.usage).toBeNull();
  });

  it("allows and reports post-consumption usage when the resource has no configured limit yet", () => {
    const decision = buildConsumeEntitlementDecision(
      "contacts",
      "free",
      { state: "unrestricted", limit_value: null, usage_before: 10, usage_after: 12, granted: true },
      2,
    );
    expect(decision.allowed).toBe(true);
    expect(decision.limit).toBeNull();
    expect(decision.usage).toBe(12);
    expect(decision.remaining).toBeNull();
  });

  it("allows and reports post-consumption usage when the resource is unlimited on the plan", () => {
    const decision = buildConsumeEntitlementDecision(
      "ai_credits",
      "max",
      { state: "unlimited", limit_value: null, usage_before: 100, usage_after: 105, granted: true },
      5,
    );
    expect(decision.allowed).toBe(true);
    expect(decision.limit).toBeNull();
    expect(decision.usage).toBe(105);
    expect(decision.remaining).toBeNull();
  });

  it("grants and reports the real new usage/remaining when consumption fits within a limited plan's limit", () => {
    const decision = buildConsumeEntitlementDecision(
      "businesses",
      "pro",
      { state: "limited", limit_value: 5, usage_before: 3, usage_after: 4, granted: true },
      1,
    );
    expect(decision.allowed).toBe(true);
    expect(decision.limit).toBe(5);
    expect(decision.usage).toBe(4);
    expect(decision.remaining).toBe(1);
  });

  it("denies and reports the pre-attempt usage/remaining -- unchanged -- when consumption would exceed a limited plan's limit", () => {
    const decision = buildConsumeEntitlementDecision(
      "businesses",
      "pro",
      { state: "limited", limit_value: 5, usage_before: 5, usage_after: 5, granted: false },
      1,
    );
    expect(decision.allowed).toBe(false);
    expect(decision.limit).toBe(5);
    expect(decision.usage).toBe(5);
    expect(decision.remaining).toBe(0);
    expect(decision.reason).toBe("pro plan allows 5 businesses; consuming 1 more would exceed it.");
  });

  it("never reports a negative remaining on a denial even if usage_before somehow exceeds the limit", () => {
    const decision = buildConsumeEntitlementDecision(
      "businesses",
      "pro",
      { state: "limited", limit_value: 5, usage_before: 9, usage_after: 9, granted: false },
      1,
    );
    expect(decision.remaining).toBe(0);
  });

  it("source is always 'plan'", () => {
    const attempts = [
      { state: "disabled", limit_value: null, usage_before: 0, usage_after: 0, granted: false },
      { state: "unrestricted", limit_value: null, usage_before: 0, usage_after: 1, granted: true },
      { state: "unlimited", limit_value: null, usage_before: 0, usage_after: 1, granted: true },
      { state: "limited", limit_value: 5, usage_before: 0, usage_after: 1, granted: true },
    ] as const;
    for (const attempt of attempts) {
      expect(buildConsumeEntitlementDecision("users", "free", attempt, 1).source).toBe("plan");
    }
  });

  it("PLATFORM-P0-06.5 decision #1: a soft limit still granted, and worded as 'within', when consumption stays under the guideline", () => {
    const decision = buildConsumeEntitlementDecision(
      "businesses",
      "pro",
      { state: "limited", limit_value: 5, limit_type: "soft", usage_before: 2, usage_after: 3, granted: true },
      1,
    );
    expect(decision.allowed).toBe(true);
    expect(decision.limit).toBe(5);
    expect(decision.usage).toBe(3);
    expect(decision.remaining).toBe(2);
    expect(decision.reason).toBe("Consuming 1 businesses keeps usage (3) within the pro plan's limit of 5.");
  });

  it("PLATFORM-P0-06.5 decision #1: a soft limit is granted (never denied) even when consumption pushes usage past the guideline, worded as 'over' rather than a denial", () => {
    const decision = buildConsumeEntitlementDecision(
      "businesses",
      "pro",
      { state: "limited", limit_value: 5, limit_type: "soft", usage_before: 5, usage_after: 6, granted: true },
      1,
    );
    expect(decision.allowed).toBe(true);
    expect(decision.limit).toBe(5);
    expect(decision.usage).toBe(6);
    expect(decision.remaining).toBe(0);
    expect(decision.reason).toBe("Consuming 1 businesses takes usage (6) over the pro plan's guideline of 5.");
  });

  it("a hard limit (explicit limit_type) still denies exactly as before, with pre-attempt usage/remaining", () => {
    const decision = buildConsumeEntitlementDecision(
      "businesses",
      "pro",
      { state: "limited", limit_value: 5, limit_type: "hard", usage_before: 5, usage_after: 5, granted: false },
      1,
    );
    expect(decision.allowed).toBe(false);
    expect(decision.usage).toBe(5);
    expect(decision.remaining).toBe(0);
  });
});
