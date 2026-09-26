import { describe, expect, it } from "vitest";
import { buildFeatureOverrideDecision, buildLimitOverrideDecision, isOverrideActive, pickActiveOverride, type BusinessOverrideRow } from "./business-override";
import { relabelAsOverride } from "./limit-entitlement";

const NOW = new Date("2026-10-01T12:00:00Z");

function row(overrides: Partial<BusinessOverrideRow> = {}): BusinessOverrideRow {
  return {
    id: "o1",
    override_type: "limit",
    limit_value: 500,
    reason: "Enterprise pilot",
    starts_at: "2026-09-25T00:00:00Z",
    expires_at: "2026-10-25T00:00:00Z",
    revoked_at: null,
    created_at: "2026-09-25T00:00:00Z",
    ...overrides,
  };
}

/** PLATFORM-P1-02.1/02.2 -- a Business Override is in force only inside its window and
 * until revoked, and replaces the plan's answer while it is. */
describe("business overrides", () => {
  it("is active only between start and expiry, and never once revoked", () => {
    expect(isOverrideActive(row(), NOW)).toBe(true);
    expect(isOverrideActive(row({ starts_at: "2026-10-02T00:00:00Z" }), NOW)).toBe(false);
    expect(isOverrideActive(row({ expires_at: "2026-10-01T12:00:00Z" }), NOW)).toBe(false);
    expect(isOverrideActive(row({ revoked_at: "2026-09-30T00:00:00Z" }), NOW)).toBe(false);
  });

  it("picks the newest in-force override", () => {
    const older = row({ id: "old", created_at: "2026-09-20T00:00:00Z", limit_value: 100 });
    const newer = row({ id: "new", created_at: "2026-09-28T00:00:00Z", limit_value: 900 });
    const expired = row({ id: "gone", created_at: "2026-09-29T00:00:00Z", expires_at: "2026-09-30T00:00:00Z" });
    expect(pickActiveOverride([older, expired, newer], NOW)?.id).toBe("new");
    expect(pickActiveOverride([expired], NOW)).toBeNull();
  });

  it("reports a temporary limit as the business's limit, sourced business_override", () => {
    expect(buildLimitOverrideDecision("prospects", row(), 120)).toMatchObject({
      allowed: true,
      source: "business_override",
      limit: 500,
      usage: 120,
      remaining: 380,
    });
    expect(buildLimitOverrideDecision("prospects", row(), 500)).toMatchObject({ allowed: false, remaining: 0 });
    expect(buildLimitOverrideDecision("prospects", row({ limit_value: null }), 9999)).toMatchObject({ allowed: true, limit: null });
  });

  it("grants a feature and says until when", () => {
    const decision = buildFeatureOverrideDecision("advanced_signals", row({ override_type: "feature", limit_value: null }));
    expect(decision).toMatchObject({ allowed: true, source: "business_override" });
    expect(decision.reason).toContain("2026-10-25");
  });

  it("relabels a consume decision without changing its numbers", () => {
    const decision = relabelAsOverride(
      { allowed: false, reason: "plan", source: "plan", limit: 500, usage: 500, remaining: 0 },
      "prospects",
      "2026-10-25T00:00:00Z",
    );
    expect(decision).toMatchObject({ allowed: false, source: "business_override", limit: 500, usage: 500, remaining: 0 });
  });
});
