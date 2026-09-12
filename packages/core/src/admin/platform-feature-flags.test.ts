import { describe, expect, it } from "vitest";
import { createFeatureFlagSchema, isFeatureFlagActive, updateFeatureFlagSchema } from "./platform-feature-flags";

const validGlobal = {
  featureKey: "ai_research",
  description: "AI-powered lead research.",
  enabled: true,
  effectiveFrom: "",
  effectiveTo: "",
  scopeType: "global" as const,
  scopePlanId: "",
  scopeModuleKey: "",
  scopeCountryCode: "",
  reason: "Registering the flag for emergency use.",
};

describe("createFeatureFlagSchema (PLATFORM-P0-08.1/08.2)", () => {
  it("accepts a valid global-scope flag", () => {
    expect(createFeatureFlagSchema.safeParse(validGlobal).success).toBe(true);
  });

  it("lowercases the feature key", () => {
    const result = createFeatureFlagSchema.safeParse({ ...validGlobal, featureKey: "AI_RESEARCH" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.featureKey).toBe("ai_research");
  });

  it("rejects a feature key with spaces or hyphens", () => {
    expect(createFeatureFlagSchema.safeParse({ ...validGlobal, featureKey: "ai research" }).success).toBe(false);
    expect(createFeatureFlagSchema.safeParse({ ...validGlobal, featureKey: "ai-research" }).success).toBe(false);
    expect(createFeatureFlagSchema.safeParse({ ...validGlobal, featureKey: "" }).success).toBe(false);
  });

  it("requires a non-empty reason", () => {
    expect(createFeatureFlagSchema.safeParse({ ...validGlobal, reason: "" }).success).toBe(false);
    expect(createFeatureFlagSchema.safeParse({ ...validGlobal, reason: "   " }).success).toBe(false);
  });

  it("normalizes an empty description to null", () => {
    const result = createFeatureFlagSchema.safeParse({ ...validGlobal, description: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.description).toBeNull();
  });

  it("requires a plan for scope_type=plan", () => {
    expect(createFeatureFlagSchema.safeParse({ ...validGlobal, scopeType: "plan", scopePlanId: "" }).success).toBe(
      false,
    );
    expect(
      createFeatureFlagSchema.safeParse({ ...validGlobal, scopeType: "plan", scopePlanId: "some-plan-id" }).success,
    ).toBe(true);
  });

  it("requires a module for scope_type=module", () => {
    expect(
      createFeatureFlagSchema.safeParse({ ...validGlobal, scopeType: "module", scopeModuleKey: "" }).success,
    ).toBe(false);
    expect(
      createFeatureFlagSchema.safeParse({ ...validGlobal, scopeType: "module", scopeModuleKey: "discovery" })
        .success,
    ).toBe(true);
  });

  it("requires a valid 2-letter country code for scope_type=country", () => {
    expect(
      createFeatureFlagSchema.safeParse({ ...validGlobal, scopeType: "country", scopeCountryCode: "" }).success,
    ).toBe(false);
    expect(
      createFeatureFlagSchema.safeParse({ ...validGlobal, scopeType: "country", scopeCountryCode: "India" }).success,
    ).toBe(false);
    expect(
      createFeatureFlagSchema.safeParse({ ...validGlobal, scopeType: "country", scopeCountryCode: "in" }).success,
    ).toBe(true);
  });

  it("rejects effectiveTo at or before effectiveFrom", () => {
    const result = createFeatureFlagSchema.safeParse({
      ...validGlobal,
      effectiveFrom: "2026-01-01T00:00:00Z",
      effectiveTo: "2026-01-01T00:00:00Z",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid effective window and normalizes to ISO strings", () => {
    const result = createFeatureFlagSchema.safeParse({
      ...validGlobal,
      effectiveFrom: "2026-01-01T00:00:00Z",
      effectiveTo: "2026-02-01T00:00:00Z",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.effectiveFrom).toBe("2026-01-01T00:00:00.000Z");
      expect(result.data.effectiveTo).toBe("2026-02-01T00:00:00.000Z");
    }
  });

  it("rejects an unparsable date", () => {
    expect(createFeatureFlagSchema.safeParse({ ...validGlobal, effectiveFrom: "not-a-date" }).success).toBe(false);
  });
});

describe("updateFeatureFlagSchema (PLATFORM-P0-08.4)", () => {
  const valid = {
    id: "11111111-1111-4111-8111-111111111111",
    description: "",
    enabled: false,
    effectiveFrom: "",
    effectiveTo: "",
    reason: "Emergency disable while investigating a cost spike.",
  };

  it("accepts a valid update", () => {
    expect(updateFeatureFlagSchema.safeParse(valid).success).toBe(true);
  });

  it("requires a non-empty reason for every change, including disabling", () => {
    expect(updateFeatureFlagSchema.safeParse({ ...valid, reason: "" }).success).toBe(false);
  });

  it("rejects an invalid id", () => {
    expect(updateFeatureFlagSchema.safeParse({ ...valid, id: "not-a-uuid" }).success).toBe(false);
  });

  it("rejects effectiveTo at or before effectiveFrom", () => {
    const result = updateFeatureFlagSchema.safeParse({
      ...valid,
      effectiveFrom: "2026-01-01T00:00:00Z",
      effectiveTo: "2025-01-01T00:00:00Z",
    });
    expect(result.success).toBe(false);
  });
});

describe("isFeatureFlagActive (PLATFORM-P0-08.1)", () => {
  const now = new Date("2026-06-15T12:00:00Z");

  it("is false when disabled, regardless of the effective window", () => {
    expect(isFeatureFlagActive({ enabled: false, effectiveFrom: null, effectiveTo: null }, now)).toBe(false);
  });

  it("is true when enabled with no effective window at all", () => {
    expect(isFeatureFlagActive({ enabled: true, effectiveFrom: null, effectiveTo: null }, now)).toBe(true);
  });

  it("is false before effectiveFrom", () => {
    expect(
      isFeatureFlagActive({ enabled: true, effectiveFrom: "2026-07-01T00:00:00Z", effectiveTo: null }, now),
    ).toBe(false);
  });

  it("is true at or after effectiveFrom", () => {
    expect(
      isFeatureFlagActive({ enabled: true, effectiveFrom: "2026-06-01T00:00:00Z", effectiveTo: null }, now),
    ).toBe(true);
  });

  it("is false after effectiveTo", () => {
    expect(
      isFeatureFlagActive({ enabled: true, effectiveFrom: null, effectiveTo: "2026-06-01T00:00:00Z" }, now),
    ).toBe(false);
  });

  it("is true within a fully bounded window", () => {
    expect(
      isFeatureFlagActive(
        { enabled: true, effectiveFrom: "2026-06-01T00:00:00Z", effectiveTo: "2026-07-01T00:00:00Z" },
        now,
      ),
    ).toBe(true);
  });
});
