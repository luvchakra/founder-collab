import { describe, expect, it } from "vitest";
import { DEFAULT_LIFECYCLE_POLICY, isSubscriptionEntitled, trialDaysFor, type LifecyclePolicy } from "./lifecycle-policy";

const policy = (overrides: Partial<LifecyclePolicy> = {}): LifecyclePolicy => ({ ...DEFAULT_LIFECYCLE_POLICY, ...overrides });
const NOW = Date.parse("2026-10-10T00:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86400_000).toISOString();

describe("trialDaysFor (PLATFORM-P1-04.2)", () => {
  it("gives no trial by default", () => {
    expect(trialDaysFor(DEFAULT_LIFECYCLE_POLICY, "pro", false)).toBe(0);
  });

  it("gives the configured trial to an eligible plan only", () => {
    const p = policy({ trialDays: 14, trialPlanKeys: ["pro"] });
    expect(trialDaysFor(p, "pro", false)).toBe(14);
    expect(trialDaysFor(p, "max", false)).toBe(0);
  });

  it("gives one trial per business", () => {
    expect(trialDaysFor(policy({ trialDays: 14, trialPlanKeys: ["pro"] }), "pro", true)).toBe(0);
  });
});

describe("isSubscriptionEntitled (PLATFORM-P1-04.3)", () => {
  it("follows the status rule when no payment grace is set (today's behaviour)", () => {
    expect(isSubscriptionEntitled("past_due", daysAgo(90), DEFAULT_LIFECYCLE_POLICY, NOW)).toBe(true);
    expect(isSubscriptionEntitled("active", null, DEFAULT_LIFECYCLE_POLICY, NOW)).toBe(true);
    expect(isSubscriptionEntitled("trialing", null, DEFAULT_LIFECYCLE_POLICY, NOW)).toBe(true);
    expect(isSubscriptionEntitled("unpaid", null, DEFAULT_LIFECYCLE_POLICY, NOW)).toBe(false);
  });

  it("keeps a past-due subscription's modules only within the payment grace", () => {
    const p = policy({ paymentGraceDays: 7 });
    expect(isSubscriptionEntitled("past_due", daysAgo(6), p, NOW)).toBe(true);
    expect(isSubscriptionEntitled("past_due", daysAgo(7), p, NOW)).toBe(false);
    expect(isSubscriptionEntitled("past_due", daysAgo(30), p, NOW)).toBe(false);
  });

  it("treats zero payment grace as losing modules at the first failed charge", () => {
    expect(isSubscriptionEntitled("past_due", daysAgo(0), policy({ paymentGraceDays: 0 }), NOW)).toBe(false);
  });

  it("never narrows a status that isn't past_due", () => {
    expect(isSubscriptionEntitled("active", daysAgo(30), policy({ paymentGraceDays: 1 }), NOW)).toBe(true);
    expect(isSubscriptionEntitled("cancelled", null, policy({ paymentGraceDays: 60 }), NOW)).toBe(false);
  });
});
