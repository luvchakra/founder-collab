import { describe, expect, it } from "vitest";
import { findMatchingRule, ruleMatches } from "./evaluate";
import type { RoutingRule } from "./types";

function makeRule(overrides: Partial<RoutingRule> = {}): RoutingRule {
  return {
    id: "rule-1",
    business_id: "biz-1",
    name: "Test rule",
    channel_id: null,
    assign_to_employee_id: null,
    priority: 0,
    is_active: true,
    condition_known_sender: "any",
    business_hours_start: null,
    business_hours_end: null,
    detected_intent_filter: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("ruleMatches", () => {
  it("an inactive rule never matches", () => {
    const rule = makeRule({ is_active: false });
    expect(ruleMatches(rule, { channelId: null, isKnownSender: true }, "UTC")).toBe(false);
  });

  it("a channel-scoped rule only matches that channel", () => {
    const rule = makeRule({ channel_id: "chan-1" });
    expect(ruleMatches(rule, { channelId: "chan-1", isKnownSender: true }, "UTC")).toBe(true);
    expect(ruleMatches(rule, { channelId: "chan-2", isKnownSender: true }, "UTC")).toBe(false);
  });

  it("condition_known_sender 'known' rejects a new sender", () => {
    const rule = makeRule({ condition_known_sender: "known" });
    expect(ruleMatches(rule, { channelId: null, isKnownSender: true }, "UTC")).toBe(true);
    expect(ruleMatches(rule, { channelId: null, isKnownSender: false }, "UTC")).toBe(false);
  });

  it("condition_known_sender 'new' rejects a known sender", () => {
    const rule = makeRule({ condition_known_sender: "new" });
    expect(ruleMatches(rule, { channelId: null, isKnownSender: false }, "UTC")).toBe(true);
    expect(ruleMatches(rule, { channelId: null, isKnownSender: true }, "UTC")).toBe(false);
  });

  it("matches inside a same-day business-hours window", () => {
    const rule = makeRule({ business_hours_start: "09:00:00", business_hours_end: "17:00:00" });
    const noon = new Date("2026-01-01T12:00:00Z");
    const midnight = new Date("2026-01-01T23:00:00Z");
    expect(ruleMatches(rule, { channelId: null, isKnownSender: true, now: noon }, "UTC")).toBe(true);
    expect(ruleMatches(rule, { channelId: null, isKnownSender: true, now: midnight }, "UTC")).toBe(false);
  });

  it("handles an overnight window that wraps past midnight", () => {
    const rule = makeRule({ business_hours_start: "22:00:00", business_hours_end: "06:00:00" });
    const lateNight = new Date("2026-01-01T23:00:00Z");
    const earlyMorning = new Date("2026-01-01T02:00:00Z");
    const afternoon = new Date("2026-01-01T14:00:00Z");
    expect(ruleMatches(rule, { channelId: null, isKnownSender: true, now: lateNight }, "UTC")).toBe(true);
    expect(ruleMatches(rule, { channelId: null, isKnownSender: true, now: earlyMorning }, "UTC")).toBe(true);
    expect(ruleMatches(rule, { channelId: null, isKnownSender: true, now: afternoon }, "UTC")).toBe(false);
  });
});

describe("findMatchingRule", () => {
  it("picks the lowest-priority matching rule", () => {
    const rules = [
      makeRule({ id: "low-priority", priority: 10, assign_to_employee_id: "emp-low" }),
      makeRule({ id: "high-priority", priority: 1, assign_to_employee_id: "emp-high" }),
    ];
    const match = findMatchingRule(rules, { channelId: null, isKnownSender: true }, "UTC");
    expect(match?.id).toBe("high-priority");
  });

  it("skips a non-matching rule and falls through to the next", () => {
    const rules = [
      makeRule({ id: "wrong-channel", priority: 1, channel_id: "chan-x" }),
      makeRule({ id: "fallback", priority: 2, channel_id: null }),
    ];
    const match = findMatchingRule(rules, { channelId: "chan-y", isKnownSender: true }, "UTC");
    expect(match?.id).toBe("fallback");
  });

  it("returns null when nothing matches", () => {
    const rules = [makeRule({ channel_id: "chan-x" })];
    const match = findMatchingRule(rules, { channelId: "chan-y", isKnownSender: true }, "UTC");
    expect(match).toBeNull();
  });
});
