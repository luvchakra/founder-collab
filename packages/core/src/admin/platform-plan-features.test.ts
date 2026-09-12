import { describe, expect, it } from "vitest";
import { createFeatureSchema } from "./platform-plan-features";

const validInput = {
  moduleKey: "discovery",
  key: "advanced_signals",
  name: "Advanced Signals",
  description: "Deeper buying-intent scoring.",
};

describe("createFeatureSchema (PLATFORM-P0-04.4)", () => {
  it("accepts a fully populated, valid input", () => {
    expect(createFeatureSchema.safeParse(validInput).success).toBe(true);
  });

  it("lowercases the key", () => {
    const result = createFeatureSchema.safeParse({ ...validInput, key: "ADVANCED_SIGNALS" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.key).toBe("advanced_signals");
  });

  it("rejects a key with spaces or hyphens", () => {
    expect(createFeatureSchema.safeParse({ ...validInput, key: "advanced signals" }).success).toBe(false);
    expect(createFeatureSchema.safeParse({ ...validInput, key: "advanced-signals" }).success).toBe(false);
    expect(createFeatureSchema.safeParse({ ...validInput, key: "" }).success).toBe(false);
  });

  it("requires a non-empty module key", () => {
    expect(createFeatureSchema.safeParse({ ...validInput, moduleKey: "" }).success).toBe(false);
  });

  it("requires a non-empty feature name", () => {
    expect(createFeatureSchema.safeParse({ ...validInput, name: "  " }).success).toBe(false);
  });

  it("normalizes an empty description to null", () => {
    const result = createFeatureSchema.safeParse({ ...validInput, description: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.description).toBeNull();
  });

  it("trims whitespace from name and description", () => {
    const result = createFeatureSchema.safeParse({ ...validInput, name: "  Advanced Signals  ", description: "  x  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Advanced Signals");
      expect(result.data.description).toBe("x");
    }
  });
});
